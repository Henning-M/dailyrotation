import React, { useEffect, useState } from 'react';

const IsActiveList = () => {
    const [teamMembers, setTeamMembers] = useState([]);

    // Fetch team members on component mount
    useEffect(() => {
        fetchTeamMembers();
    }, []);

    const fetchTeamMembers = async () => {
        try {
            const response = await fetch('http://localhost:5000/team-members');
            const data = await response.json();
            setTeamMembers(data);
        } catch (error) {
            console.error('Error fetching team members:', error);
        }
    };

    const toggleActiveStatus = async (id) => {
        try {
            await fetch(`http://localhost:5000/team-members/toggle/${id}`, { 
                method: 'POST' 
            });
            fetchTeamMembers(); // Refresh list after toggling
        } catch (error) {
            console.error('Error toggling status:', error);
        }
    };

    return (
        <div>
            <h2>Team Members</h2>
            <ul>
                {teamMembers.map(member => (
                    <li key={member.id}>
                        {member.name} 
                        <input 
                            type="checkbox" 
                            checked={member.is_active} 
                            onChange={() => toggleActiveStatus(member.id)}
                        />
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default IsActiveList;
