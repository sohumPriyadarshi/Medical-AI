// Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getDatabase, get, ref, set, onValue, remove } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { askGemini } from "./gemini.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDAD3eB0B8Z3-du8i2bV7BYPrq9qKEyPOk",
  authDomain: "ai-doctor-3c61b.firebaseapp.com",
  databaseURL: "https://ai-doctor-3c61b-default-rtdb.firebaseio.com",
  projectId: "ai-doctor-3c61b",
  storageBucket: "ai-doctor-3c61b.appspot.com",
  messagingSenderId: "1061105015789",
  appId: "1:1061105015789:web:3ecb011765a4e5ee4a65e4",
  measurementId: "G-VQL0H21RZ8"
};

// Initialize Firebase app, database, and auth
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
auth.languageCode = 'en';
const provider = new GoogleAuthProvider();

// variables
const history = [];
let userId = null;
let sessionID = crypto.randomUUID();

// variables for file upload
const dropArea = document.querySelector(".drop-section")
const listSection = document.querySelector(".list-section")
const listContainer = document.querySelector(".list")
const fileSelector = document.querySelector(".file-selector")
const fileSelectorInput = document.querySelector(".file-selector-input")

// upload files with browse button
fileSelector.onclick = () => fileSelectorInput.click();

fileSelectorInput.onchange = () => {
  [...fileSelectorInput.files].forEach((file) => {
    if (typeValidation(file.type)) {
      uploadFile(file);
    }
  });
};

// when file is over the drop area
dropArea.ondragover = (e) => {
  e.preventDefault();
  [...e.dataTransfer.items].forEach((item) => {
    if (typeValidation(item.type)) {
      dropArea.classList.add('drag-over-effect');
    }
  })
};

// when the file leaves the drop area
dropArea.ondragleave = () => {
  dropArea.classList.remove('drag-over-effect');
}

// when file drop on the drag area
dropArea.ondrop = (e) => {
    e.preventDefault();
    dropArea.classList.remove('drag-over-effect')
    if(e.dataTransfer.items){
        [...e.dataTransfer.items].forEach((item) => {
            if(item.kind === 'file'){
                const file = item.getAsFile();
                if(typeValidation(file.type)){
                    uploadFile(file)
                }
            }
        })
    }else{
        [...e.dataTransfer.files].forEach((file) => {
            if(typeValidation(file.type)){
                uploadFile(file)
            }
        })
    }
}

// DOMContentLoaded event: attach UI event listeners
window.addEventListener("DOMContentLoaded", () => {
  // Google login button
  document.getElementById("google-login-button").addEventListener("click", () => {
    signInWithPopup(auth, provider)
      .then((result) => {
        userId = result.user.uid;
      })
      .catch((error) => {
        console.error("Login error:", error.code, error.message);
      });
  });

  document.getElementById("continue-button").addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("user-info-screen").style.display = "none";
    document.querySelector(".sidebar").style.display = "flex";
    document.getElementById("chat-screen").style.display = "flex";
    document.querySelector(".app-wrapper").style.display = "flex";
    localStorage.setItem("formCompleted", "true");
    sessionID = crypto.randomUUID();
  })

  // Listen for Enter key in chat input
  document.getElementById('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      getMessage();
    }

    // change name
    document.getElementById("home-link").textContent = "🧑‍⚕️ New Chat";
  });

  // Sidebar navigation: Home link
  document.getElementById('home-link').addEventListener('click', (e) => {
    e.preventDefault();

    // reset chat
    document.getElementById("chat-container").innerHTML = "";
    history.length = 0;
    sessionID = crypto.randomUUID();
    
    document.getElementById("consultations-screen").style.display = "none";
    document.getElementById("chat-screen").style.display = "flex";

    // set active link
    document.getElementById('home-link').classList.add('active');
    document.getElementById('chats-link').classList.remove('active');

    // change name
    document.getElementById("home-link").textContent = "🧑‍⚕️ Assistant";
  });

  // Sidebar navigation: Chats link
  document.getElementById('chats-link').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById("chat-screen").style.display = "none";
    document.getElementById("consultations-screen").style.display = "flex";

    document.getElementById("home-link").textContent = "🧑‍⚕️ Assistant";

    // set active link
    document.getElementById('chats-link').classList.add('active');
    document.getElementById('home-link').classList.remove('active');
  });

  // handle dashboard with previous chats
  document.getElementById('consultation-list').addEventListener('click', (e) => {
  const deleteBtn = e.target.closest('.delete-button');
  const card = e.target.closest('.dashboard-card');

  // Handle delete
  if (deleteBtn && card) {
    const sessionID = card.getAttribute('session');
    const sessionRef = ref(db, `users/${userId}/sessions/${sessionID}`);
    remove(sessionRef)
      .then(() => {
        card.remove();
      })
    return;
  }

  // Handle opening session
  if (card && !deleteBtn) {
    // switch to chat screen
    document.getElementById("consultations-screen").style.display = "none";
    document.getElementById("chat-screen").style.display = "flex";

    // update sidebar
    document.getElementById('home-link').classList.add('active');
    document.getElementById('chats-link').classList.remove('active');
    document.getElementById("home-link").textContent = "🧑‍⚕️ New Chat";

    // load session
    sessionID = card.getAttribute('session');
    loadSession(userId, sessionID);
  }
});
});


// Firebase auth state listener
onAuthStateChanged(auth, (user) => {
  if (user) {
    userId = user.uid;

    if (localStorage.getItem("formCompleted") === "true") {
      document.getElementById("login-screen").style.display = "none";
      document.getElementById("user-info-screen").style.display = "none";
      document.querySelector(".sidebar").style.display = "flex";
      document.getElementById("chat-screen").style.display = "flex";
      document.querySelector(".app-wrapper").style.display = "flex";
      previousSessions(userId);
    } else {
      document.getElementById("login-screen").style.display = "none";
      document.getElementById("user-info-screen").style.display = "flex";
      document.querySelector(".sidebar").style.display = "none";
      document.getElementById("chat-screen").style.display = "none";
    }
  } else {
    document.getElementById("login-screen").style.display = "flex";
    document.getElementById("user-info-screen").style.display = "none";
    document.querySelector(".sidebar").style.display = "none";
    document.getElementById("chat-screen").style.display = "none";
    localStorage.setItem("formCompleted", "false");
  }
});

// Send user message and get response from Gemini API
export function getMessage(message) {
  if (!message) {
    const input = document.getElementById('chat-input');
    message = input.value.trim();
    if (!message) return;
    input.value = '';
  }

  addMessage(message, 'user');
  history.push({ role: "user", content: message });

  askGemini(history)
    .then(response => {
      addMessage(response.text, 'bot');
      updateFirebase(sessionID, response.text, response.name);
    })
    .catch(error => {
      addMessage("Error: " + error.message, 'bot');
    });
}

// Add message bubble to chat UI
function addMessage(text, sender) {
  const container = document.getElementById('chat-container');
  const msg = document.createElement('div');
  msg.className = `message ${sender === 'user' ? 'user-message' : 'bot-message'}`;
  msg.innerHTML = text;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

// Save session history to Firebase
function updateFirebase(sessionID, response, name) {
  history.push({ role: "assistant", content: response });

  if (!name) {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const yy = now.getFullYear();
    name = `${mm}/${dd}/${yy}`;
  }

  const sessionRef = ref(db, `users/${userId}/sessions/${sessionID}`);

  // Check if session already has a name, and use it if present
  get(sessionRef).then(snapshot => {
    const sessionData = snapshot.val();
    if (sessionData && sessionData.name) {
      name = sessionData.name;
    }
    set(sessionRef, { name, history });
    return;
  });
  set(sessionRef, { name, history });
}

// Load previous sessions and create buttons dynamically
function previousSessions(userId) {
  const sessionsRef = ref(db, `users/${userId}/sessions`);

  onValue(sessionsRef, (snapshot) => {
    const dashboard = document.getElementById('consultation-list');
    const data = snapshot.val();

    dashboard.innerHTML = ''; // Clear old sessions to avoid duplicates

    if (data) {
      // loop through sessions
      for (const sessionID in data) {
        const session = data[sessionID];

        const button = document.createElement('div');
        button.className = 'dashboard-card';
        button.setAttribute('session', sessionID);

        // Add session name
        const name = document.createElement('div');
        name.textContent = session.name;
        name.className = 'session-name';

        // Add delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-button';
        deleteBtn.innerHTML = '🗑️';

        // Append both to the card
        button.appendChild(name);
        button.appendChild(deleteBtn);
        dashboard.appendChild(button);
      }
    }
  });
}

// Load and display a selected chat session
function loadSession(userId, sessionID) {
  const sessionRef = ref(db, `users/${userId}/sessions/${sessionID}/history`);

  // reset values
  history.length = 0;
  document.getElementById("chat-container").innerHTML = "";

  get(sessionRef)
    .then(snapshot => {
      const session = snapshot.val();
      if (session) {
        for (const msgKey in session) {
          const message = session[msgKey];
          history.push(message);
          addMessage(message.content, message.role);
        }
      }
    })
}

// check file type
function typeValidation(type) {
  return type === "application/pdf";
}

// upload file function
function uploadFile(file){
    listSection.style.display = 'block'
    var li = document.createElement('li')
    li.classList.add('in-prog')
    li.innerHTML = `
        <div class="col">
            <img src="icons/${iconSelector(file.type)}" alt="">
        </div>
        <div class="col">
            <div class="file-name">
                <div class="name">${file.name}</div>
                <span>0%</span>
            </div>
            <div class="file-progress">
                <span></span>
            </div>
            <div class="file-size">${(file.size/(1024*1024)).toFixed(2)} MB</div>
        </div>
        <div class="col">
            <svg xmlns="http://www.w3.org/2000/svg" class="cross" height="20" width="20"><path d="m5.979 14.917-.854-.896 4-4.021-4-4.062.854-.896 4.042 4.062 4-4.062.854.896-4 4.062 4 4.021-.854.896-4-4.063Z"/></svg>
            <svg xmlns="http://www.w3.org/2000/svg" class="tick" height="20" width="20"><path d="m8.229 14.438-3.896-3.917 1.438-1.438 2.458 2.459 6-6L15.667 7Z"/></svg>
        </div>
    `
    listContainer.prepend(li)
    var http = new XMLHttpRequest()
    var data = new FormData()
    data.append('file', file)
    http.onload = () => {
        li.classList.add('complete')
        li.classList.remove('in-prog')
    }
    http.upload.onprogress = (e) => {
        var percent_complete = (e.loaded / e.total)*100
        li.querySelectorAll('span')[0].innerHTML = Math.round(percent_complete) + '%'
        li.querySelectorAll('span')[1].style.width = percent_complete + '%'
    }
    http.open('POST', 'sender.php', true)
    http.send(data)
    li.querySelector('.cross').onclick = () => http.abort()
    http.onabort = () => li.remove()
}
// find icon for file
function iconSelector(type){
    var splitType = (type.split('/')[0] == 'application') ? type.split('/')[1] : type.split('/')[0];
    return splitType + '.png'
}