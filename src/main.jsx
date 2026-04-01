import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
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
