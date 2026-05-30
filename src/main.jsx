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
import { NotificationProvider } from "./Context/NotificationContext";
import { PresenceProvider } from "./Context/PresenceContext";
import { MessageProcessingProvider } from "./Context/MessageProcessingContext";
import "./resource/style/modern-ui.css";

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <UserProvider>
      <ThemeProvider>
        <ContactProvider>
          <PresenceProvider>
            <MessageProcessingProvider>
              <NotificationProvider>
                <App />
              </NotificationProvider>
            </MessageProcessingProvider>
          </PresenceProvider>
        </ContactProvider>
      </ThemeProvider>
    </UserProvider>
  </StrictMode>,
)
