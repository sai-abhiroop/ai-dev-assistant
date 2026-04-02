import React, { useState, useEffect } from "react";
import axios from "axios";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { toast } from "react-hot-toast";
import "./Login.css";
axios.defaults.baseURL = process.env.REACT_APP_API_URL;
function Login({ onSuccess }) {
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [isSignup, setIsSignup] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(0);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const handleGoogleLogin = async (response) => {

    try {

      const res = await axios.post(
        "/api/google-login",
        { credential: response.credential }
      );

      onSuccess(res.data.token, "Google login successful!");

    } catch (err) {
      console.error(err);
      toast.error("Google login failed");
    }

  };
  
  useEffect(() => {

    if (window.google) {

      window.google.accounts.id.initialize({
        client_id: process.env.REACT_APP_GOOGLE_CLIENT_ID,
        callback: handleGoogleLogin
      });

      window.google.accounts.id.renderButton(
        document.getElementById("googleBtn"),
        {
          theme: "outline",
          size: "large",
          width: 320
        }
      );

    }

  }, [handleGoogleLogin]);

  useEffect(() => {
  
      if (timer <= 0) return;

      const interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);

      return () => clearInterval(interval);
    }, [timer]);

    useEffect(() => {
        if (!email) {
        setOtpSent(false);
        setOtp("");
        setTimer(0);
      }
    }, [email]);


  const handleAuth = async () => {


    if (!emailRegex.test(email)) {
      toast.error("Enter valid email");
      return;
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    try {

      setLoading(true);

      if (isSignup) {
        if (!otpSent) {
          toast.error("Please verify email first");
          return;
        }

        await axios.post(
          "/api/signup",
          { name, email, password }
        );

        await axios.post(
          "/api/verify-otp",
          { email, otp }
        );

        onSuccess(null,"Signup successful!");

      } else {

        const res = await axios.post(
          "/api/login",
          { email, password }
        );

        onSuccess(res.data.token, "Login successful!");

      }

    } catch (err) {
      toast.error(err.response?.data?.error || "Error");
    } finally {
      setLoading(false);
    }

  };

  const sendOtp = async () => {
    console.log("Sending OTP to:", email);

  try {

    await axios.post("/api/send-otp", { email });
      console.log("Sent OTP to:", email);

    toast.success("OTP sent!");
    setOtpSent(true);
    setTimer(30); 

  } catch(err) {
     console.log("OTP ERROR:", err);
    toast.error("Failed to send OTP");
  }

};

  return (

    <div className="login-card">

      <h2>{isSignup ? "Create Account" : "Welcome Back"}</h2>

      <div id="googleBtn"></div>

      <div className="divider">or</div>


      {isSignup && (
        <div className="input-group">
          <input required onChange={(e) => setName(e.target.value)} />
          <label>Name</label>
        </div>
      )}

      <div className="input-group">
        <input type="email" required onChange={(e) => setEmail(e.target.value)} />
        <label>Email</label>
      </div>

       {otpSent && (
          <div className="input-group">
          <input onChange={(e) => setOtp(e.target.value)} />
          <label>Enter OTP</label>
          </div>
        )}

      {isSignup && emailRegex.test(email) && (
        <button
          className="otp-btn"
          onClick={sendOtp}
          disabled={timer > 0}
        >
          {timer > 0
          ? `Resend in ${timer}s`
          : otpSent
          ? "Resend OTP"
          : "Send OTP"}
        </button>
      )}

      <div className="input-group password">
        <input
          type={showPass ? "text" : "password"}
          required
          onChange={(e) => setPassword(e.target.value)}
        />
        <label>Password</label>

        <span onClick={() => setShowPass(!showPass)}>
          {showPass ? <FaEyeSlash /> : <FaEye />}
        </span>
      </div>

      <button onClick={handleAuth} disabled={loading}>
        {loading ? "Please wait..." : (isSignup ? "Signup" : "Login")}
      </button>

      <p onClick={() => setIsSignup(!isSignup)}>
        {isSignup
          ? "Already have an account? Login"
          : "New user? Signup"}
      </p>

    </div>

  );

}

export default Login;