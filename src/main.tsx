import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import RootApplication from './App.tsx';
import './index.css';

// The application mount point is isolated here to guarantee that rendering logic 
// does not pollute the application's core structural components.
const systemRootElement = document.getElementById('root');

if (!systemRootElement) {
  throw new Error('System initialization failure: Target DOM node "root" is missing from index.html.');
}

createRoot(systemRootElement).render(
  <StrictMode>
    <RootApplication />
  </StrictMode>
);
