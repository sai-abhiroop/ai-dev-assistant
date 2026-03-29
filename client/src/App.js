import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { marked } from "marked";
import Editor from "@monaco-editor/react";
import "./App.css";
import {
  FaTrash,
  FaBars,
  FaUserCircle,
  FaChevronDown
} from "react-icons/fa";
import Login from "./Login";
import { Toaster, toast } from "react-hot-toast";

function App() {

  const [code, setCode] = useState("");
  const [html, setHtml] = useState("");
  const [history, setHistory] = useState([]);
  const [language, setLanguage] = useState("javascript");
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [token, setToken] = useState(localStorage.getItem("token"));
  const [showLogin, setShowLogin] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const responseRef = useRef();

  // ================= HISTORY =================
  const loadHistory = async () => {
    if (!token) return;

    try {
      const res = await axios.get(
        "http://localhost:5000/api/history",
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      setHistory(res.data);
    } catch (err) {
      console.log(err);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [token]);

  // ================= LOGIN SUCCESS =================
  const handleLoginSuccess = (newToken, message) => {

    if (newToken) {
      localStorage.setItem("token", newToken);
      setToken(newToken);
    }

    setShowLogin(false);
    toast.success(message);
  };

  // ================= AI =================
  const callAI = async (type) => {

    if (!code.trim()) {
      toast.error("Paste code first");
      return;
    }

    try {

      setLoading(true);
      setHtml("");

      const res = await axios.post(
        "http://localhost:5000/api/explain",
        { code, type },
        {
          headers: token
            ? { Authorization: `Bearer ${token}` }
            : {}
        }
      );

      const fullText = res.data.result;

      let index = 0;
      let temp = "";

      const interval = setInterval(() => {

        if (index < fullText.length) {

          temp += fullText[index];
          setHtml(marked(temp + "▌"));

          responseRef.current?.scrollIntoView({ behavior: "smooth" });

          index++;

        } else {

          clearInterval(interval);
          setHtml(marked(temp));
          setLoading(false);

          if (token) loadHistory();

        }

      }, 10);

    } catch {
      toast.error("AI request failed");
      setLoading(false);
    }

  };

  // ================= OTHER =================
  const loadSnippet = (snippet) => {
    setCode(snippet.code);
    setHtml(marked(snippet.response));
  };

  const deleteSnippet = async (id) => {
    await axios.delete(
      `http://localhost:5000/api/history/${id}`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    loadHistory();
  };

  const clearEditor = () => {
    setCode("");
    setHtml("");
  };

  const copyResponse = () => {
    const temp = document.createElement("div");
    temp.innerHTML = html;
    navigator.clipboard.writeText(temp.innerText);

    toast.success("Copied!");
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setHistory([]);
    toast.success("Logged out");
  };

  return (
    <div className={`app ${theme}`}>

       <Toaster
        position="top-right"
        containerStyle={{
          top: 20,
          right: 20,
          zIndex: 999999 // 🔥 VERY HIGH
        }}
      />

      {/* MODAL */}
      {showLogin && (
        <div className="modal-overlay" onClick={() => setShowLogin(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <Login onSuccess={handleLoginSuccess} />
            <button
              className="close-btn"
              onClick={() => setShowLogin(false)}
            >
              ✖
            </button>
          </div>
        </div>
      )}

      {/* SIDEBAR */}
      <div className={`sidebar ${sidebarOpen ? "open" : "collapsed"}`}>

        <div className="sidebar-top">
          <h3>{sidebarOpen && "History"}</h3>
          <button onClick={toggleSidebar} className="collapse-btn">
            <FaBars />
          </button>
        </div>

        {sidebarOpen && history.map((item) => (
          <div key={item._id} className="history-item">

            <span onClick={() => loadSnippet(item)}>
              {item.code.substring(0, 40)}...
            </span>

            <button onClick={() => deleteSnippet(item._id)}>
              <FaTrash />
            </button>

          </div>
        ))}

      </div>

      {/* MAIN */}
      <div className="main">

        <div className="header">

          <h1>🚀 AI Developer Assistant</h1>

          <div className="header-actions">

          <div style={{ position: "relative" }}>

            <button onClick={toggleTheme}>
              {theme === "dark" ? "☀" : "🌙"}
            </button>

            {!token ? (
              <button onClick={() => setShowLogin(true)}>
                <FaUserCircle /> Login
              </button>
            ) : (
              <div className="profile-section">

                <div
                  className="profile-btn"
                  onClick={() => setShowDropdown(!showDropdown)}
                >
                  <FaUserCircle size={20} />
                  <FaChevronDown size={12} />
                </div>

                {showDropdown && (
                  <div className="dropdown">

                    <div className="dropdown-item">
                      👤 Profile
                    </div>

                    <div
                      className="dropdown-item"
                      onClick={logout}
                    >
                      🚪 Logout
                    </div>

                  </div>
                )}

              </div>
            )}
            </div>

          </div>

        </div>

        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          <option value="javascript">JavaScript</option>
          <option value="cpp">C++</option>
          <option value="python">Python</option>
          <option value="java">Java</option>
        </select>

        <Editor
          height="300px"
          language={language}
          theme={theme === "dark" ? "vs-dark" : "light"}
          value={code}
          onChange={(value) => setCode(value)}
        />

        <div className="buttons">
          <button onClick={() => callAI("explain")}>Explain</button>
          <button onClick={() => callAI("debug")}>Debug</button>
          <button onClick={() => callAI("optimize")}>Optimize</button>
          <button onClick={() => callAI("complexity")}>Complexity</button>
          <button className="clear-btn" onClick={clearEditor}>Clear</button>
        </div>

        {loading && <p>🤖 Thinking...</p>}

        {(html || loading) && (
          <div className="response">

            <div className="response-header">
              <h2>AI Response</h2>
              {html && <button onClick={copyResponse}>Copy</button>}
            </div>

            <div dangerouslySetInnerHTML={{ __html: html }} />

            <div ref={responseRef}></div>

          </div>
        )}

      </div>

    </div>
  );
}

export default App;