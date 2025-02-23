import React from "react";
import ManageTeam from "./ManageTeam";
// import IsActiveList from "./IsActiveList";

const Home = () => {
  return (
    <div>
      <h1>Home Page Title</h1>
      <ManageTeam />
      {/* <IsActiveList /> */}
    </div>
  )
}

export default Home;

//To have both components live in one container and stay in sync (i.e. when a team member is removed, it automatically disappears from IsActiveList), the state needs to be managed outside of the functional components