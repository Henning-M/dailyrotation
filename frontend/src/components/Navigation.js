import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/navigation.css';

const Navigation = () => {
  return (
    <nav className="navbar">
      <ul>
        <li><Link to="/">Home</Link></li>
        <li><Link to="/about">About</Link></li>
        <li><Link to="/tempcontainer">TempContainer</Link></li>
      </ul>
    </nav>
  );
};

export default Navigation;
