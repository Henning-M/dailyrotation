import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ManageTeam = () => {
  const [teamMembers, setTeamMembers] = useState([]);
  const [newMember, setNewMember] = useState('');

  // Fetch team members on initial load
  useEffect(() => {
    axios.get('http://localhost:5000/team-members')
      .then(response => {
        setTeamMembers(response.data);
      })
      .catch(error => console.error('Error fetching team members:', error));
  }, []);

  // Function to handle adding a new team member
  const handleAddMember = () => {
    if (!newMember.trim()) return; // Don't add empty names

    axios.post('http://localhost:5000/team-members', { name: newMember })
      .then(response => {
        setTeamMembers([...teamMembers, response.data]); // Add new member to state
        setNewMember(''); // Clear input field
      })
      .catch(error => console.error('Error adding team member:', error));
  };

  // Function to handle deleting a team member
  const handleDeleteMember = (id) => {
    axios.delete(`http://localhost:5000/team-members/${id}`)
      .then(() => {
        setTeamMembers(teamMembers.filter(member => member.id !== id)); // Remove member from state
      })
      .catch(error => console.error('Error deleting team member:', error));
  };

  return (
    <div>
      <h2>Team Members</h2>
      <input 
        type="text" 
        value={newMember} 
        onChange={(e) => setNewMember(e.target.value)} 
        placeholder="Enter team member name"
      />
      <button onClick={handleAddMember}>Add team member</button>
      
      <ul>
        {teamMembers.map(member => (
          <li key={member.id}>
            {member.name} 
            <button onClick={() => handleDeleteMember(member.id)}>X</button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ManageTeam;
