import React, { useState, useEffect } from 'react';

const TeamShuffle = () => {
  const [teamMembers, setTeamMembers] = useState([]);
  const [shuffledMembers, setShuffledMembers] = useState([]);

  useEffect(() => {
    const fetchActiveMembers = async () => {
      try {
        const response = await fetch('http://localhost:5000/team-members');
        const data = await response.json();
        const activeMembers = data.filter(member => member.is_active);
        setTeamMembers(activeMembers);
      } catch (error) {
        console.error('Error fetching team members:', error);
      }
    };
    fetchActiveMembers();
  }, []);

  const shuffleTeam = () => {
    const shuffled = [...teamMembers].sort(() => Math.random() - 0.5);
    setShuffledMembers(shuffled);
  };

  const clearList = () => {
    setShuffledMembers([]);
  };

  return (
    <div>
      <h2>Team Shuffle</h2>
      <button onClick={shuffleTeam}>Shuffle</button>
      {shuffledMembers.length > 0 && <button onClick={clearList}>Clear list</button>}
      {shuffledMembers.length > 0 && (
        <ol>
          {shuffledMembers.map(member => (
            <li key={member.id}>{member.name}</li>
          ))}
        </ol>
      )}
    </div>
  );
};

export default TeamShuffle;
