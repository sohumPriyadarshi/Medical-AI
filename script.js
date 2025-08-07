// Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getDatabase,
  get,
  ref,
  set,
  onValue,
  remove,
  query,
  orderByChild,
  update,
  push,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js";
import { askGemini, summarizeFile } from "./gemini.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDAD3eB0B8Z3-du8i2bV7BYPrq9qKEyPOk",
  authDomain: "ai-doctor-3c61b.firebaseapp.com",
  databaseURL: "https://ai-doctor-3c61b-default-rtdb.firebaseio.com",
  projectId: "ai-doctor-3c61b",
  storageBucket: "ai-doctor-3c61b.firebasestorage.app",
  messagingSenderId: "1061105015789",
  appId: "1:1061105015789:web:3ecb011765a4e5ee4a65e4",
  measurementId: "G-VQL0H21RZ8",
};

// Initialize Firebase app, database, and auth
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const storage = getStorage(app);
auth.languageCode = "en";
const provider = new GoogleAuthProvider();

// variables for chats
const history = [];
let userId = null;
let sessionID = crypto.randomUUID();

// variables for file upload
const dropArea = document.querySelector(".drop-section");
const listSection = document.querySelector(".list-section");
const listContainer = document.querySelector(".list");
const fileSelector = document.querySelector(".file-selector");
const fileSelectorInput = document.querySelector(".file-selector-input");
const allowedFileTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
];

// variables for calendar
const date = document.querySelector(".date");
const daysContainer = document.querySelector(".days");
const prev = document.querySelector(".prev");
const next = document.querySelector(".next");
const todayBtn = document.querySelector(".today-btn");
const gotoBtn = document.querySelector(".goto-btn");
const dateInput = document.querySelector(".date-input");

let today = new Date();
let activeDay;
let month = today.getMonth();
let year = today.getFullYear();

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// other variables
const maxPoints = 300;
let overlayTimeout;

// DOMContentLoaded event: attach UI event listeners
window.addEventListener("DOMContentLoaded", () => {
  // Google login button
  document
    .getElementById("google-login-button")
    .addEventListener("click", () => {
      signInWithPopup(auth, provider)
        .then((result) => {
          userId = result.user.uid;
          set(ref(db, `users/${userId}`), { points: 0 });
        })
        .catch((error) => {
          console.error("Login error:", error.code, error.message);
        });
    });

  // Listen for Enter key in chat input
  document.getElementById("chat-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      getMessage();

      // change name
      document.getElementById("home-link").textContent = "🧑‍⚕️ New Chat";
    }
  });

  document.getElementById("send-button").addEventListener("click", (e) => {
    e.preventDefault();
    getMessage();

    // change name
    document.getElementById("home-link").textContent = "🧑‍⚕️ New Chat";
  });

  // Sidebar navigation: Home link
  document.getElementById("home-link").addEventListener("click", (e) => {
    e.preventDefault();

    // reset chat
    document.getElementById("chat-container").innerHTML = "";
    history.length = 0;
    sessionID = crypto.randomUUID();

    setActiveScreen("chat-screen", "home-link");
  });
});

// Sidebar navigation: Chats link
document.getElementById("chats-link").addEventListener("click", (e) => {
  e.preventDefault();
  setActiveScreen("consultations-screen", "chats-link");
  // handle dashboard with previous chats
  handleSessionCards();
});

// Sidebar navigation: Records link
document.getElementById("records-link").addEventListener("click", (e) => {
  e.preventDefault();
  setActiveScreen("records-screen", "records-link");

  // handle upload area
  handleUploadScreen();
});

// Sidebar navigation: Appointments link
document.getElementById("appointments-link").addEventListener("click", (e) => {
  e.preventDefault();
  setActiveScreen("appointments-screen", "appointments-link");

  //control calendar
  initCalendar();
  prev.addEventListener("click", prevMonth);
  next.addEventListener("click", nextMonth);
  todayBtn.addEventListener("click", () => {
    today = new Date();
    month = today.getMonth();
    year = today.getFullYear();
    dateInput.value = "";
    initCalendar();
  });
  dateInput.addEventListener("keyup", (e) => {
    if (e.key != "Backspace") {
      dateInput.value = dateInput.value.replace(/[^0-9/]/g, ""); // only allow numbers, remove anything else
      if (dateInput.value.length === 2) {
        dateInput.value += "/";
      }
      if (dateInput.value.length > 7) {
        dateInput.value = dateInput.value.slice(0, 7);
      }
    }
  });
  gotoBtn.addEventListener("click", gotoDate);
});

// Firebase auth state listener
onAuthStateChanged(auth, (user) => {
  if (user) {
    userId = user.uid;

    // Always show full app after login
    document.getElementById("login-screen").style.display = "none";
    document.querySelector(".sidebar").style.display = "flex";
    document.querySelector(".app-wrapper").style.display = "flex";

    // Default to chat screen
    setActiveScreen("chat-screen", "home-link");

    previousSessions(userId);
  } else {
    // Show login only
    document.getElementById("login-screen").style.display = "flex";
    document.querySelector(".sidebar").style.display = "none";
    document.querySelector(".app-wrapper").style.display = "none";
  }
});

// Send user message and get response from Gemini API
export function getMessage(message) {
  if (!message) {
    const input = document.getElementById("chat-input");
    message = input.value.trim();
    if (!message) return;
    input.value = "";
  }

  addMessage(message, "user");
  history.push({ role: "user", content: message });

  askGemini(history, userId)
    .then((response) => {
      addMessage(response.text, "bot");
      updateFirebase(sessionID, response.text, response.name);
    })
    .catch((error) => {
      addMessage("Error: " + error.message, "bot");
    });
}

// Add message bubble to chat UI
function addMessage(text, sender) {
  const container = document.getElementById("chat-container");
  const msg = document.createElement("div");
  msg.className = `message ${
    sender === "user" ? "user-message" : "bot-message"
  }`;
  msg.innerHTML = text;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

// Save session history to Firebase
function updateFirebase(sessionID, response, name) {
  history.push({ role: "assistant", content: response });

  if (!name) {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const yy = now.getFullYear();
    name = `${mm}/${dd}/${yy}`;
  }

  const sessionRef = ref(db, `users/${userId}/sessions/${sessionID}`);

  // Check if session already has a name, and use it if present
  get(sessionRef).then((snapshot) => {
    const sessionData = snapshot.val();
    if (sessionData && sessionData.name) {
      if (sessionData.name[0] != "0") {
        name = sessionData.name;
      }
    }
    set(sessionRef, { name, history, createdAt: Date.now() });
    return;
  });
  set(sessionRef, { name, history, createdAt: Date.now() });
}

// Load previous sessions and create buttons dynamically
function previousSessions(userId) {
  const sessionsRef = ref(db, `users/${userId}/sessions`);

  onValue(query(sessionsRef, orderByChild("createdAt")), (snapshot) => {
    const dashboard = document.getElementById("consultation-list");
    dashboard.innerHTML = ""; // Clear old sessions

    const sessions = [];
    snapshot.forEach((child) => {
      sessions.push({ id: child.key, ...child.val() });
    });

    sessions.reverse();

    for (const session of sessions) {
      const button = document.createElement("div");
      button.className = "dashboard-card";
      button.setAttribute("session", session.id);

      const name = document.createElement("div");
      name.textContent = session.name;
      name.className = "session-name";

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "delete-button";
      deleteBtn.innerHTML = "🗑️";

      button.appendChild(name);
      button.appendChild(deleteBtn);
      dashboard.appendChild(button);
    }
  });
}

// Load and display a selected chat session
function loadSession(userId, sessionID) {
  const sessionRef = ref(db, `users/${userId}/sessions/${sessionID}/history`);

  // reset values
  history.length = 0;
  document.getElementById("chat-container").innerHTML = "";

  get(sessionRef).then((snapshot) => {
    const session = snapshot.val();
    if (session) {
      for (const msgKey in session) {
        const message = session[msgKey];
        history.push(message);
        addMessage(message.content, message.role);
      }
    }
  });
}

// handle dashboard with previous chats
function handleSessionCards() {
  document
    .getElementById("consultation-list")
    .addEventListener("click", (e) => {
      const deleteBtn = e.target.closest(".delete-button");
      const card = e.target.closest(".dashboard-card");

      // Handle delete
      if (deleteBtn && card) {
        const sessionID = card.getAttribute("session");
        const sessionRef = ref(db, `users/${userId}/sessions/${sessionID}`);
        remove(sessionRef).then(() => {
          card.remove();
        });
        return;
      }

      // Handle opening session
      if (card && !deleteBtn) {
        // switch to chat screen
        document.getElementById("consultations-screen").style.display = "none";
        document.getElementById("chat-screen").style.display = "flex";

        // update sidebar
        document.getElementById("home-link").classList.add("active");
        document.getElementById("chats-link").classList.remove("active");
        document.getElementById("home-link").textContent = "🧑‍⚕️ New Chat";

        // load session
        sessionID = card.getAttribute("session");
        loadSession(userId, sessionID);
      }
    });
}

// check file type
function typeValidation(type) {
  return allowedFileTypes.includes(type);
}

// upload file to Firebase Storage
function uploadFile(file) {
  listSection.style.display = "block";
  const li = document.createElement("li");
  li.classList.add("in-prog");
  li.innerHTML = `
      <div class="col">
        <img
          src="icons/${iconSelector(file.type)}"
          alt=""
          style="width: 40px; height: 50px; object-fit: contain; max-width: 100%; max-height: 100%;"
        />
      </div>
      <div class="col">
          <div class="file-name">
              <div class="name">${file.name}</div>
              <span>0%</span>
          </div>
          <div class="file-progress">
              <span></span>
          </div>
          <div class="file-size">${(file.size / (1024 * 1024)).toFixed(
            2
          )} MB</div>
      </div>
      <div class="col">
          <svg xmlns="http://www.w3.org/2000/svg" class="cross" height="20" width="20">
              <path d="m5.979 14.917-.854-.896 4-4.021-4-4.062.854-.896 4.042 4.062 4-4.062.854.896-4 4.062 4 4.021-.854.896-4-4.063Z"/>
          </svg>
          <svg xmlns="http://www.w3.org/2000/svg" class="tick" height="20" width="20">
              <path d="m8.229 14.438-3.896-3.917 1.438-1.438 2.458 2.459 6-6L15.667 7Z"/>
          </svg>
      </div>
  `;
  listContainer.prepend(li);

  const filePath = `users/${userId}/uploads/${file.name}`;
  const fileRef = storageRef(storage, filePath);
  const uploadTask = uploadBytesResumable(fileRef, file);

  // Cancel upload
  li.querySelector(".cross").onclick = () => uploadTask.cancel();

  uploadTask.on(
    "state_changed",
    (snapshot) => {
      const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
      li.querySelectorAll("span")[0].innerHTML = Math.round(progress) + "%";
      li.querySelectorAll("span")[1].style.width = progress + "%";
    },
    (error) => {
      if (error.code === "storage/canceled") {
        li.remove();
      } else {
        console.error("Upload failed:", error);
        li.querySelectorAll("span")[0].innerHTML = "Error";
      }
    },
    async () => {
      li.classList.add("complete");
      li.classList.remove("in-prog");
      setTimeout(() => {
        updatePoints(10);
      }, 500);

      let summary = "";

      if (
        file.type == "application/pdf" ||
        file.type ==
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        const pdfText = await readFile(file);
        summary = await summarizeFile({ text: pdfText });
      } else if (file.type.startsWith("image/")) {
        const base64Image = await fileToBase64(file);
        summary = await summarizeFile({
          base64: base64Image,
          mimeType: file.type,
        });
      }

      // upload file metadata to database
      const filesRef = ref(db, `users/${userId}/files`);
      const newFilesRef = push(filesRef);
      set(newFilesRef, {
        name: file.name,
        type: file.type,
        size: file.size,
        storagePath: filePath,
        summary: summary,
      });
    }
  );
}

async function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async function () {
      const pdfData = new Uint8Array(this.result);
      const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;

      let extractedText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);

        const textContent = await page.getTextContent();

        textContent.items.forEach((item) => {
          extractedText += item.str + "";
        });
      }

      resolve(extractedText.trim());
      reader.onerror = reject;
    };
    reader.readAsArrayBuffer(file);
  });
}

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function (event) {
      const base64String = event.target.result.split(",")[1]; // Remove data prefix
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function iconSelector(type) {
  if (!type || !type.includes("/")) return "unknown.png";
  const [, subType] = type.split("/");
  return subType + ".png";
}

// handle UI and behavior for uploading files
function handleUploadScreen() {
  // upload files with browse button
  fileSelector.onclick = () => fileSelectorInput.click();

  fileSelectorInput.onchange = () => {
    [...fileSelectorInput.files].forEach((file) => {
      if (typeValidation(file.type)) {
        uploadFile(file);
      } else {
        alert("Only PDF, JPG, PNG, or Word files are allowed.");
      }
    });
  };

  // when file is over the drop area
  dropArea.ondragover = (e) => {
    e.preventDefault();
    [...e.dataTransfer.items].forEach((item) => {
      if (typeValidation(item.type)) {
        dropArea.classList.add("drag-over-effect");
      } else {
        alert("Only PDF, JPG, PNG, or Word files are allowed.");
      }
    });
  };

  // when the file leaves the drop area
  dropArea.ondragleave = () => {
    dropArea.classList.remove("drag-over-effect");
  };

  // when file drops on the drag area
  dropArea.ondrop = (e) => {
    e.preventDefault();
    dropArea.classList.remove("drag-over-effect");
    if (e.dataTransfer.items) {
      [...e.dataTransfer.items].forEach((item) => {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (typeValidation(file.type)) {
            uploadFile(file);
          } else {
            alert("Only PDF, JPG, PNG, or Word files are allowed.");
          }
        }
      });
    } else {
      [...e.dataTransfer.files].forEach((file) => {
        if (typeValidation(file.type)) {
          uploadFile(file);
        } else {
          alert("Only PDF, JPG, PNG, or Word files are allowed.");
        }
      });
    }
  };
}

// populate the calendar with days
function initCalendar() {
  // variables to set calendar layout
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const prevLastDay = new Date(year, month, 0);
  const prevDays = prevLastDay.getDate();
  const lastDate = lastDay.getDate();
  const day = firstDay.getDay();
  const nextDays = 7 - lastDay.getDay() - 1;

  // update date at the top of calendar
  date.innerHTML = months[month] + " " + year;

  // adding days on dom
  let days = "";

  //previous month days
  for (let i = day; i > 0; i--) {
    days += `<div class="day prev-date" >${prevDays - i + 1}</div>`;
  }

  // current month days
  for (let i = 1; i <= lastDate; i++) {
    // add class if day is current day
    if (
      i === new Date().getDate() &&
      month === new Date().getMonth() &&
      year === new Date().getFullYear()
    ) {
      days += `<div class="day today" >${i}</div>`;
    }
    // add remaining days of the month
    else {
      days += `<div class="day " >${i}</div>`;
    }
  }

  //next month days
  for (let i = 1; i <= nextDays; i++) {
    days += `<div class="day next-date" >${i}</div>`;
  }

  daysContainer.innerHTML = days;
}

// previous month
function prevMonth() {
  month--;
  if (month < 0) {
    month = 11;
    year--;
  }
  initCalendar();
}

function nextMonth() {
  month++;
  if (month > 11) {
    month = 0;
    year++;
  }
  initCalendar();
}

function gotoDate() {
  const dateArr = dateInput.value.split("/");
  if (dateArr.length === 2) {
    if (dateArr[0] > 0 && dateArr[0] < 13 && dateArr[1].length === 4) {
      month = dateArr[0] - 1;
      year = dateArr[1];
      initCalendar();
      return;
    }
  }
  alert("Invalid Date");
}

function setActiveScreen(screenId, linkId) {
  // Hide all main screens
  document.getElementById("chat-screen").style.display = "none";
  document.getElementById("consultations-screen").style.display = "none";
  document.getElementById("records-screen").style.display = "none";
  document.getElementById("appointments-screen").style.display = "none";

  // Show the selected screen
  document.getElementById(screenId).style.display = "flex";

  // Clear all active link styles
  document.querySelectorAll(".sidebar a").forEach((link) => {
    link.classList.remove("active");
  });

  // Set the clicked link as active
  document.getElementById(linkId).classList.add("active");

  // Change the home link name
  document.getElementById("home-link").textContent = "🧑‍⚕️ Assistant";
}

function updatePoints(newPoints) {
  const overlay = document.getElementById("points-overlay");
  const currentBar = document.getElementById("currentBar");
  const futureBar = document.getElementById("futureBar");
  const pointsAdditionLabel = document.getElementById("pointsLabel");
  const totalPointsLabel = document.getElementById("currentLabel");

  get(ref(db, `users/${userId}/points`)).then((snapshot) => {
    const currentPoints = snapshot.val() || 0;
    const newTotal = currentPoints + newPoints;

    // Update DB
    update(ref(db, `users/${userId}`), { points: newTotal });

    const startPercent = Math.min((currentPoints / maxPoints) * 100, 100);
    const endPercent = Math.min((newTotal / maxPoints) * 100, 100);

    // Set futureBar to full target
    futureBar.style.width = `${endPercent}%`;

    // Set currentBar to current width instantly
    currentBar.style.transition = "none";
    currentBar.style.width = `${startPercent}%`;

    // Force layout so the transition kicks in
    void currentBar.offsetWidth;

    // Animate to new width
    currentBar.style.transition = "width 1s ease-out";
    currentBar.style.width = `${endPercent}%`;

    // Update label
    pointsAdditionLabel.textContent = `+${newPoints} pts`;
    totalPointsLabel.textContent = `${newTotal}`;

    // Show overlay
    overlay.classList.add("active");

    // Hide overlay after 2.5s
    clearTimeout(overlayTimeout);
    overlayTimeout = setTimeout(() => {
      overlay.classList.remove("active");

      setTimeout(() => {
        currentBar.style.width = "0%";
        futureBar.style.width = "0%";
        pointsAdditionLabel.textContent = "";
        totalPointsLabel.textContent = "";
      }, 400);
    }, 2500);
  });
}

/* export async function getFiles(userId) {
  const filesRef = ref(db, `users/${userId}/files`);
  const snapshot = await get(filesRef);
  const files = snapshot.val();
  if (!files) return [];

  const summaries = Object.values(files).map((file) => file.summary);
  return summaries;
} */
