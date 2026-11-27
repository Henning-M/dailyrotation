<#
  Deployment of Daily Ranking Roulette to GCP (Cloud Run behind IAP, europe-west1). Idempotent.

  .\deploy\deploy.ps1 -Setup         # one-time: project, APIs, service account, database, secret
  .\deploy\deploy.ps1                # build image (Cloud Build, tag = git commit) and deploy
  .\deploy\deploy.ps1 -SkipBuild     # redeploy configuration with the last built image

  IAP (sign-in with your Google account) needs an OAuth client once (see README):
  .\deploy\deploy.ps1 -SkipBuild -IapClientId <id>.apps.googleusercontent.com -IapClientSecretFile <path>

  The database lives on the existing Cloud SQL instance of Dynasty GM (separate database and user);
  nothing else on that instance is touched.
#>
param(
    [switch]$Setup,
    [string]$BillingAccount,   # only for -Setup; default: the first open billing account of your gcloud login
    [switch]$SkipBuild,
    [string]$IapClientId,
    [string]$IapClientSecretFile
)
# gcloud writes progress to stderr; errors are detected via $LASTEXITCODE instead.
$ErrorActionPreference = 'Continue'

$Project        = 'daily-rotation-21311'
$Region         = 'europe-west1'
$SqlProject     = 'dynasty-gm-515120'
$SqlInstance    = 'dynasty-gm-db'
$Instance       = "${SqlProject}:${Region}:${SqlInstance}"
$DbName         = 'daily_rotation'
$DbUser         = 'daily_app'
$Secret         = 'daily-db-password'
$Service        = 'daily-rotation'
$SaName         = 'daily-web'
$Sa             = "$SaName@$Project.iam.gserviceaccount.com"
$Repo           = "$Region-docker.pkg.dev/$Project/daily"
$Root           = Split-Path -Parent $PSScriptRoot
$Owner          = "user:$((gcloud config get-value account 2>$null).Trim())"

function Invoke-Gcloud {
    gcloud @args
    if ($LASTEXITCODE -ne 0) { throw "gcloud $args failed" }
}
function G { Invoke-Gcloud @args --project=$Project }

# --- one-time setup -------------------------------------------------------
if ($Setup) {
    $projects = gcloud projects list --format="value(projectId)"
    if ($projects -notcontains $Project) {
        Invoke-Gcloud projects create $Project --name="Daily Rotation"
    }
    if (-not $BillingAccount) {
        $BillingAccount = (gcloud billing accounts list --filter="open=true" --format="value(name)" --limit=1).Trim() -replace '^billingAccounts/', ''
    }
    Invoke-Gcloud billing projects link $Project --billing-account=$BillingAccount | Out-Null
    G services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com `
        secretmanager.googleapis.com sqladmin.googleapis.com iap.googleapis.com iam.googleapis.com
    # freshly enabled APIs need a moment before they accept calls (otherwise 403 PERMISSION_DENIED)
    for ($i = 0; $i -lt 12; $i++) {
        gcloud artifacts repositories list --location=$Region --project=$Project --format="value(name)" 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { break }
        Start-Sleep -Seconds 10
    }

    $repos = gcloud artifacts repositories list --location=$Region --project=$Project --format="value(name)"
    if (-not ($repos -match '(^|/)daily$')) {
        G artifacts repositories create daily --repository-format=docker --location=$Region
    }

    # Cloud Build runs as the Compute Engine default service account in new projects
    $projectNumber = (gcloud projects describe $Project --format="value(projectNumber)").Trim()
    $buildSa = "serviceAccount:$projectNumber-compute@developer.gserviceaccount.com"
    foreach ($role in 'roles/artifactregistry.writer', 'roles/logging.logWriter', 'roles/storage.objectViewer') {
        G projects add-iam-policy-binding $Project --member=$buildSa --role=$role --condition=None --quiet | Out-Null
    }

    $sas = gcloud iam service-accounts list --project=$Project --format="value(email)"
    if ($sas -notcontains $Sa) {
        G iam service-accounts create $SaName --display-name="Daily Rotation web (Cloud Run)"
    }
    # Cloud SQL access on the shared instance (other project)
    Invoke-Gcloud projects add-iam-policy-binding $SqlProject --member="serviceAccount:$Sa" `
        --role=roles/cloudsql.client --condition=None --quiet | Out-Null

    # Database + user on the shared instance, password in Secret Manager
    $dbs = gcloud sql databases list --instance=$SqlInstance --project=$SqlProject --format="value(name)"
    if ($dbs -notcontains $DbName) {
        Invoke-Gcloud sql databases create $DbName --instance=$SqlInstance --project=$SqlProject
    }
    $secrets = gcloud secrets list --project=$Project --format="value(name)"
    if (-not ($secrets -match "(^|/)$Secret$")) {
        $bytes = New-Object byte[] 24
        [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
        $password = ([Convert]::ToBase64String($bytes)) -replace '[+/=]', 'x'
        $users = gcloud sql users list --instance=$SqlInstance --project=$SqlProject --format="value(name)"
        if ($users -contains $DbUser) {
            Invoke-Gcloud sql users set-password $DbUser --instance=$SqlInstance --project=$SqlProject --password=$password
        } else {
            Invoke-Gcloud sql users create $DbUser --instance=$SqlInstance --project=$SqlProject --password=$password
        }
        $tmp = New-TemporaryFile
        try {
            [System.IO.File]::WriteAllText($tmp.FullName, $password)
            G secrets create $Secret --data-file=$($tmp.FullName) --replication-policy=automatic
        } finally { Remove-Item $tmp.FullName }
    }
    G secrets add-iam-policy-binding $Secret --member="serviceAccount:$Sa" `
        --role=roles/secretmanager.secretAccessor --quiet | Out-Null
    Write-Host "Setup done."
}

# --- image ----------------------------------------------------------------
$sha = (git -C $Root rev-parse --short HEAD).Trim()
if (-not $SkipBuild) {
    if (git -C $Root status --porcelain) { Write-Warning "Uncommitted changes - image tag $sha does not match the commit exactly." }
    $Image = "$Repo/app:$sha"
    Push-Location $Root
    try { G builds submit --region=$Region --tag $Image . } finally { Pop-Location }
} else {
    $Image = (gcloud artifacts docker images list "$Repo/app" --project=$Project --sort-by=~UPDATE_TIME --limit=1 --format="value(format('{0}@{1}', package, version))")
    if (-not $Image) { throw "No image in $Repo/app yet - run without -SkipBuild first." }
}

# --- Cloud Run service behind IAP ------------------------------------------
G run deploy $Service --region=$Region --image=$Image --service-account=$Sa `
    --add-cloudsql-instances=$Instance `
    --set-env-vars="DB_HOST=/cloudsql/$Instance,DB_NAME=$DbName,DB_USER=$DbUser" `
    --set-secrets="DB_PASSWORD=${Secret}:latest" `
    --memory=512Mi --cpu=1 --min-instances=0 --max-instances=1 --timeout=120 `
    --no-allow-unauthenticated --iap
$projectNumber = (gcloud projects describe $Project --format="value(projectNumber)").Trim()
G run services add-iam-policy-binding $Service --region=$Region `
    --member="serviceAccount:service-$projectNumber@gcp-sa-iap.iam.gserviceaccount.com" --role=roles/run.invoker --quiet | Out-Null
G iap web add-iam-policy-binding --resource-type=cloud-run --service=$Service --region=$Region `
    --member=$Owner --role=roles/iap.httpsResourceAccessor --condition=None --quiet | Out-Null
if ($IapClientId) {
    if (-not (Test-Path $IapClientSecretFile)) { throw "IapClientSecretFile not found" }
    $secretValue = (Get-Content $IapClientSecretFile -Raw).Trim()
    $settings = Join-Path $env:TEMP "daily-iap-settings.json"
    @{ access_settings = @{ oauth_settings = @{ client_id = $IapClientId; client_secret = $secretValue } } } |
        ConvertTo-Json -Depth 5 | Out-File -Encoding ascii $settings
    try {
        G iap settings set $settings --resource-type=cloud-run --service=$Service --region=$Region | Out-Null
    } finally { Remove-Item $settings }
}

$url = (gcloud run services describe $Service --region=$Region --project=$Project --format="value(status.url)").Trim()
Write-Host "Done. Moderator: $url/moderator   Show: $url/show"
