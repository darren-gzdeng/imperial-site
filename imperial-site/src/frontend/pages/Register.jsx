import { useState } from "react";
import { useNavigate } from "react-router";
import { register } from "../api/authApi";
import GoogleLogo from "../components/auth/GoogleLogo";

export default function Register() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();

    try {
      await register({ email, password, first_name: firstName, last_name: lastName });
      setMessage("Account created");
      setTimeout(() => navigate("/login"), 1000);
    } catch (err) {
      setMessage(`Server error: ${err.message}`);
    }
  };

  const handleGoogleSignup = () => {
    setMessage("Google sign up is not set up yet");
  };

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <h1 className="auth-title">Create account</h1>

        <button type="button" onClick={handleGoogleSignup} className="auth-google-button">
          <GoogleLogo />
          <span className="auth-google-text">Sign up with Google</span>
        </button>

        <div className="auth-divider">
          <div className="auth-divider__line"></div>
          <span className="auth-divider__text">OR</span>
          <div className="auth-divider__line"></div>
        </div>

        <form onSubmit={handleRegister} className="auth-form">
          <input
            type="text"
            placeholder="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="auth-input"
          />

          <input
            type="text"
            placeholder="Last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="auth-input"
          />

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="auth-input"
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="auth-input auth-input--strong"
            required
          />

          <div className="auth-submit-row">
            <button type="submit" className="auth-submit-button">
              Create
            </button>
          </div>
        </form>

        {message ? <p className="auth-message">{message}</p> : null}
      </div>
    </div>
  );
}
