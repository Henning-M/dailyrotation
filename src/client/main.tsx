import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Moderator } from './pages/Moderator';
import { Show } from './pages/Show';
import './styles.css';

// Two views: /moderator (not shared) and /show (shared via screen share).
const path = window.location.pathname.replace(/\/+$/, '');
if (path === '' || path === '/') window.history.replaceState(null, '', '/moderator');
const isShow = path === '/show';

createRoot(document.getElementById('root')!).render(<StrictMode>{isShow ? <Show /> : <Moderator />}</StrictMode>);
