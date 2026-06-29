import { auth, db } from "./config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, getDocs, onSnapshot, query, orderBy,
  limit, doc, setDoc, getDoc, where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const userList      = document.getElementById("userList");
const logoutBtn     = document.getElementById("logoutBtn");
const searchInput   = document.getElementById("searchInput");
const addContactBtn = document.getElementById("addContactBtn");
const modalOverlay  = document.getElementById("modalOverlay");
const cancelBtn     = document.getElementById("cancelBtn");
const confirmAddBtn = document.getElementById("confirmAddBtn");
const contactEmail  = document.getElementById("contactEmail");
const addResult     = document.getElementById("addResult");

let myUID    = null;
let myEmail  = null;
let allContacts = [];

function mkChatId(a, b){ return [a,b].sort().join("_"); }

function safePhoto(url, name){
  if(!url || url.includes("imgur.com")){
    return "https://placehold.co/50x50/2a3942/8696a0?text=" + encodeURIComponent((name||"U")[0].toUpperCase());
  }
  return url;
}

// ── Auth ──────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if(!user){ window.location.href = "index.html"; return; }
  myUID   = user.uid;
  myEmail = user.email;
  loadContacts();
});

if(logoutBtn){
  logoutBtn.addEventListener("click", ()=>{
    signOut(auth).then(()=> window.location.href = "index.html");
  });
}

// ── Load Contacts (sirf jo add kiye hain) ─────────────────
async function loadContacts(){
  try{
    allContacts = [];

    // Apne contacts lo Firestore se
    const contactsSnap = await getDocs(collection(db, "users", myUID, "contacts"));

    for(const c of contactsSnap.docs){
      const contactUID = c.id;
      // Us contact ki info lo
      const userSnap = await getDoc(doc(db, "users", contactUID));
      if(userSnap.exists()){
        allContacts.push({uid: contactUID, ...userSnap.data()});
      }
    }

    renderContacts(allContacts);
  }catch(e){ console.log(e); }
}

// ── Add Contact Modal ─────────────────────────────────────
addContactBtn.addEventListener("click", ()=>{
  modalOverlay.classList.add("show");
  contactEmail.value = "";
  addResult.textContent = "";
  addResult.style.color = "#8696a0";
});

cancelBtn.addEventListener("click", ()=>{
  modalOverlay.classList.remove("show");
});

modalOverlay.addEventListener("click", e=>{
  if(e.target === modalOverlay) modalOverlay.classList.remove("show");
});

confirmAddBtn.addEventListener("click", async ()=>{
  const email = contactEmail.value.trim().toLowerCase();
  if(!email){
    addResult.textContent = "Email likho!";
    addResult.style.color = "#e74c3c";
    return;
  }
  if(email === myEmail){
    addResult.textContent = "Apni ID add nahi kar sakte!";
    addResult.style.color = "#e74c3c";
    return;
  }

  addResult.textContent = "Dhundh raha hoon...";
  addResult.style.color = "#8696a0";
  confirmAddBtn.disabled = true;

  try{
    // Email se user dhundo
    const usersSnap = await getDocs(collection(db, "users"));
    let foundUser = null;
    usersSnap.forEach(d => {
      if(d.data().email && d.data().email.toLowerCase() === email){
        foundUser = {uid: d.id, ...d.data()};
      }
    });

    if(!foundUser){
      addResult.textContent = "Yeh email registered nahi hai!";
      addResult.style.color = "#e74c3c";
      confirmAddBtn.disabled = false;
      return;
    }

    // Already added check
    const alreadySnap = await getDoc(doc(db, "users", myUID, "contacts", foundUser.uid));
    if(alreadySnap.exists()){
      addResult.textContent = "Yeh contact already add hai!";
      addResult.style.color = "#e74c3c";
      confirmAddBtn.disabled = false;
      return;
    }

    // Add contact — dono taraf
    await setDoc(doc(db, "users", myUID, "contacts", foundUser.uid), {
      addedAt: new Date().toISOString(),
      email: foundUser.email,
      name: foundUser.name || foundUser.email
    });

    // Dusre ki taraf se bhi add karo (optional — WhatsApp mein dono pe dikhta hai)
    await setDoc(doc(db, "users", foundUser.uid, "contacts", myUID), {
      addedAt: new Date().toISOString(),
      email: myEmail,
      name: ""
    });

    addResult.textContent = "✅ Contact add ho gaya!";
    addResult.style.color = "#25d366";

    setTimeout(()=>{
      modalOverlay.classList.remove("show");
      loadContacts(); // Refresh list
    }, 1500);

  }catch(e){
    addResult.textContent = "Error: " + e.message;
    addResult.style.color = "#e74c3c";
  }
  confirmAddBtn.disabled = false;
});

// ── Last message + unread badge listener ──────────────────
function getLastMsgText(data){
  if(data.deleted)           return "🚫 Message delete ho gaya";
  if(data.type === "text")   return data.content || "";
  if(data.type === "image")  return "📷 Image";
  if(data.type === "audio")  return "🎤 Voice message";
  if(data.type === "file")   return "📄 " + (data.fileName||"File");
  return "";
}

function listenChat(uid){
  const chatId = mkChatId(myUID, uid);
  const q = query(
    collection(db,"chats",chatId,"messages"),
    orderBy("timestamp","desc"),
    limit(20)
  );
  onSnapshot(q, snap => {
    let unread = 0, lastMsg = "", lastTime = "", first = true;
    snap.forEach(d => {
      const data = d.data();
      if(first){ lastMsg = getLastMsgText(data); lastTime = data.time||""; first=false; }
      if(data.senderId !== myUID && !data.seen) unread++;
    });
    const card = document.querySelector('[data-uid="' + uid + '"]');
    if(!card) return;
    card.querySelector(".last-msg").textContent = lastMsg;
    card.querySelector(".msg-time").textContent = lastTime;
    const badge = card.querySelector(".unread-badge");
    badge.textContent   = unread > 99 ? "99+" : String(unread);
    badge.style.display = unread > 0 ? "flex" : "none";
  });
}

// ── Render Contacts ───────────────────────────────────────
function renderContacts(contacts){
  userList.innerHTML = "";

  if(!contacts.length){
    userList.innerHTML = `
      <div style="text-align:center;padding:40px 20px;color:#8696a0;">
        <div style="font-size:48px;margin-bottom:12px;">👥</div>
        <p style="font-size:15px;margin-bottom:8px;">Koi contact nahi</p>
        <p style="font-size:13px;">➕ button se contact add karo</p>
      </div>`;
    return;
  }

  contacts.forEach(data => {
    const name  = data.name || data.email || "User";
    const photo = safePhoto(data.photoURL, name);

    const card = document.createElement("div");
    card.dataset.uid = data.uid;
    card.style.cssText = "display:flex;align-items:center;padding:12px 15px;border-bottom:1px solid #2a3942;cursor:pointer;gap:12px;transition:background .15s;";
    card.addEventListener("mouseover", ()=> card.style.background="#2a3942");
    card.addEventListener("mouseout",  ()=> card.style.background="transparent");
    card.addEventListener("click", ()=>{
      localStorage.setItem("chatUID",   data.uid);
      localStorage.setItem("chatName",  name);
      localStorage.setItem("chatPhoto", data.photoURL||"");
      localStorage.setItem("chatEmail", data.email||"");
      window.location.href = "chat.html";
    });

    const img = document.createElement("img");
    img.src = photo;
    img.style.cssText = "width:50px;height:50px;border-radius:50%;object-fit:cover;flex-shrink:0;";
    img.onerror = ()=>{ img.src = safePhoto("", name); };

    const info = document.createElement("div");
    info.style.cssText = "flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;";

    const row1 = document.createElement("div");
    row1.style.cssText = "display:flex;justify-content:space-between;align-items:center;";
    const nameEl = document.createElement("span");
    nameEl.textContent = name;
    nameEl.style.cssText = "color:white;font-size:16px;font-weight:500;";
    const timeEl = document.createElement("span");
    timeEl.className = "msg-time";
    timeEl.style.cssText = "color:#8696a0;font-size:11px;";
    row1.appendChild(nameEl);
    row1.appendChild(timeEl);

    const row2 = document.createElement("div");
    row2.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:6px;";
    const lastMsgEl = document.createElement("span");
    lastMsgEl.className = "last-msg";
    lastMsgEl.style.cssText = "color:#8696a0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;";
    const badge = document.createElement("span");
    badge.className = "unread-badge";
    badge.style.cssText = "display:none;background:#25d366;color:white;border-radius:50%;min-width:20px;height:20px;font-size:11px;font-weight:600;align-items:center;justify-content:center;padding:0 4px;flex-shrink:0;";
    row2.appendChild(lastMsgEl);
    row2.appendChild(badge);

    info.appendChild(row1);
    info.appendChild(row2);
    card.appendChild(img);
    card.appendChild(info);
    userList.appendChild(card);

    listenChat(data.uid);
  });
}

// ── Search ────────────────────────────────────────────────
if(searchInput){
  searchInput.addEventListener("input", ()=>{
    const q = searchInput.value.toLowerCase();
    renderContacts(q
      ? allContacts.filter(u => (u.name||"").toLowerCase().includes(q) || (u.email||"").toLowerCase().includes(q))
      : allContacts
    );
  });
}