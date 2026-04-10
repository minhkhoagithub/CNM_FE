import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Polyfill for SockJS - define global object for Node.js modules
if (typeof global === 'undefined') {
  window.global = window;
}

// import './index.css'
import App from './App.jsx'
import { ThemeProvider } from "./Context/ThemeContext";
import { UserProvider } from "./Context/UserContext";
import { ContactProvider } from "./Context/ContactConext";

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <UserProvider>
      <ThemeProvider>
        <ContactProvider>
          <App />
        </ContactProvider>
      </ThemeProvider>
    </UserProvider>
  </StrictMode>,
)
