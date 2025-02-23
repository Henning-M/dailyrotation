const express = require('express');
const cors = require('cors');
const pool = require('./db'); // Import the pool from db.js

// Set up Express app
const app = express();
const port = 5000; // You can change the port if you prefer

// Enable CORS
app.use(cors());

// Middleware to parse JSON request bodies
app.use(express.json());

// Route to get all team members (sorted by date_added)
app.get('/team-members', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM "team-members" ORDER BY date_added ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching team members');
  }
});


// Route to add a team member
app.post('/team-members', async (req, res) => {
  const { name } = req.body; // Get the name from the request body
  if (!name) {
    return res.status(400).send('Name is required');
  }

  try {
    const result = await pool.query(
      'INSERT INTO "team-members" (name) VALUES ($1) RETURNING *',
      [name]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error adding team member');
  }
});

// Route to delete a team member by ID
app.delete('/team-members/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM "team-members" WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) {
      return res.status(404).send('Team member not found');
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error deleting team member');
  }
});

// POST: Toggle is_active status for a team member
app.post('/team-members/toggle/:id', async (req, res) => {
  try {
      const { id } = req.params;
      const result = await pool.query(
          'UPDATE "team-members" SET is_active = NOT is_active WHERE id = $1 RETURNING *',
          [id]
      );

      if (result.rows.length === 0) {
          return res.status(404).json({ error: 'ID not found in team-members' });
      }

      res.json(result.rows[0]);
  } catch (err) {
      console.error(err.message);
      res.status(500).send('Server error');
  }
});



// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
    