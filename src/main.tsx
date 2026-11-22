import {StrictMode} from 'react';
import {createRoot, hydrateRoot} from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';

const root = document.getElementById('root')!;
const prerendered = root.dataset.prerendered === 'true';
const application = (
  <StrictMode>
    <BrowserRouter>
      <App prerendered={prerendered}/>
    </BrowserRouter>
  </StrictMode>
);
if (prerendered) hydrateRoot(root, application);
else createRoot(root).render(application);
