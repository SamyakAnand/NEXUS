"use client";

import emailjs from "@emailjs/browser";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  FiCheck,
  FiCopy,
  FiExternalLink,
  FiFacebook,
  FiGithub,
  FiInstagram,
  FiLinkedin,
  FiMail,
  FiMapPin,
  FiMessageSquare,
  FiPhone,
  FiSend,
  FiShield,
  FiUser,
} from "react-icons/fi";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { api } from "@/lib/api";

const SERVICE_ID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID || "service_hk72t6g";
const TEMPLATE_ID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID || "template_cwuq73n";
const PUBLIC_KEY = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY || "RyYjzXPQkgqfzpaP_";

export function ContactSection() {
  const reduceMotion = useReducedMotion();
  const [formData, setFormData] = useState({
    user_name: "",
    user_email: "",
    subject: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (PUBLIC_KEY) {
      emailjs.init(PUBLIC_KEY);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    toast.success(`Copied ${label} to clipboard!`);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const sendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.user_name || !formData.user_email || !formData.message) {
      toast.warn("Please complete all required fields.");
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Dual delivery: Send via EmailJS client
      await emailjs.send(SERVICE_ID, TEMPLATE_ID, {
        user_name: formData.user_name,
        name: formData.user_name,
        user_email: formData.user_email,
        email: formData.user_email,
        subject: formData.subject || "NEXUS Platform Collaboration Inquiry",
        message: formData.message,
      });

      // 2. Dual delivery: Persist directly into SQLite/PostgreSQL database via FastAPI backend
      try {
        await api.contact({
          name: formData.user_name,
          email: formData.user_email,
          subject: formData.subject || "NEXUS Inquiry",
          message: formData.message,
        });
      } catch {
        // Backend persistence fallback silent
      }

      toast.success("Message dispatched directly to Samyak Anand!");
      setIsSubmitted(true);
      setFormData({
        user_name: "",
        user_email: "",
        subject: "",
        message: "",
      });
    } catch (err) {
      console.error("EmailJS dispatch failed:", err);
      // Fallback directly to backend
      try {
        await api.contact({
          name: formData.user_name,
          email: formData.user_email,
          subject: formData.subject || "NEXUS Inquiry",
          message: formData.message,
        });
        toast.success("Message saved securely to database! Samyak will respond shortly.");
        setIsSubmitted(true);
        setFormData({ user_name: "", user_email: "", subject: "", message: "" });
      } catch {
        toast.error("Failed to send message. Please reach out directly at samyak.g.anand@gmail.com");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section id="contact" className="contact-suite-section">
      <ToastContainer position="bottom-right" theme="dark" autoClose={3500} />

      {/* Ambient background glow orbs */}
      <div className="contact-ambient-layer" aria-hidden="true">
        <div className="ambient-orb ambient-orb-purple" />
        <div className="ambient-orb ambient-orb-blue" />
        <div className="ambient-orb ambient-orb-cyan" />
      </div>

      <div className="contact-container">
        {/* Section Header */}
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: -20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="contact-header"
        >
          <div className="contact-badge">
            <span className="live-ping" />
            DIRECT CREATOR DISPATCH
          </div>
          <h2>
            Let’s Build the Future of <span>Autonomous AI.</span>
          </h2>
          <p>
            Whether you’re exploring enterprise deployment, custom multi-source integrations, or technical advisory,
            connect directly with the founder and architect of NEXUS.
          </p>
        </motion.div>

        {/* 2-Column Grid */}
        <div className="contact-grid">
          {/* Left Column: Creator Identity & Direct Coordinates */}
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="creator-info-panel"
          >
            <div className="creator-status-card">
              <div className="status-indicator">
                <span className="pulse-dot" />
                <span className="status-text">Available for High-Impact Advisory &amp; Architecture</span>
              </div>
              <h3 className="creator-name">Samyak Anand</h3>
              <p className="creator-role">Founder &amp; Principal AI Architect · NEXUS</p>
              <p className="creator-bio">
                Specializing in autonomous reasoning agents, source-agnostic analytical pipelines, and transparent
                statistical computation. Passionate about building AI systems where every metric is grounded in verifiable evidence.
              </p>
            </div>

            {/* Direct Coordinates */}
            <div className="contact-cards-list">
              {/* Email */}
              <div className="coordinate-card">
                <div className="coord-icon email-icon">
                  <FiMail size={18} />
                </div>
                <div className="coord-details">
                  <span className="coord-label">Direct Email</span>
                  <a href="mailto:samyak.g.anand@gmail.com" className="coord-value">
                    samyak.g.anand@gmail.com
                  </a>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard("samyak.g.anand@gmail.com", "Email")}
                  className="coord-copy-btn"
                  title="Copy email"
                >
                  {copiedKey === "Email" ? <FiCheck size={14} className="copied-check" /> : <FiCopy size={14} />}
                </button>
              </div>

              {/* Phone */}
              <div className="coordinate-card">
                <div className="coord-icon phone-icon">
                  <FiPhone size={18} />
                </div>
                <div className="coord-details">
                  <span className="coord-label">Phone &amp; WhatsApp</span>
                  <a href="tel:+919623719948" className="coord-value">
                    +91 9623719948
                  </a>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard("+919623719948", "Phone")}
                  className="coord-copy-btn"
                  title="Copy phone"
                >
                  {copiedKey === "Phone" ? <FiCheck size={14} className="copied-check" /> : <FiCopy size={14} />}
                </button>
              </div>

              {/* Location */}
              <div className="coordinate-card">
                <div className="coord-icon location-icon">
                  <FiMapPin size={18} />
                </div>
                <div className="coord-details">
                  <span className="coord-label">Base Location</span>
                  <span className="coord-value">Hyderabad, Telangana, India</span>
                </div>
              </div>
            </div>

            {/* Social Footprint */}
            <div className="social-footprint">
              <span className="social-heading">Verified Profiles &amp; Repositories</span>
              <div className="social-links-row">
                <a
                  href="https://github.com/SamyakAnand"
                  target="_blank"
                  rel="noreferrer"
                  className="social-pill github"
                  title="GitHub Profile"
                >
                  <FiGithub size={16} />
                  <span>GitHub</span>
                  <FiExternalLink size={12} className="ext-icon" />
                </a>
                <a
                  href="https://www.linkedin.com/in/samyak-anand/"
                  target="_blank"
                  rel="noreferrer"
                  className="social-pill linkedin"
                  title="LinkedIn Profile"
                >
                  <FiLinkedin size={16} />
                  <span>LinkedIn</span>
                  <FiExternalLink size={12} className="ext-icon" />
                </a>
                <a
                  href="https://www.instagram.com/samyak_anand_/"
                  target="_blank"
                  rel="noreferrer"
                  className="social-pill instagram"
                  title="Instagram Profile"
                >
                  <FiInstagram size={16} />
                  <span>Instagram</span>
                  <FiExternalLink size={12} className="ext-icon" />
                </a>
                <a
                  href="https://www.facebook.com/samyak.anand.9"
                  target="_blank"
                  rel="noreferrer"
                  className="social-pill facebook"
                  title="Facebook Profile"
                >
                  <FiFacebook size={16} />
                  <span>Facebook</span>
                  <FiExternalLink size={12} className="ext-icon" />
                </a>
              </div>
            </div>
          </motion.div>

          {/* Right Column: Interactive Liquid Glass Contact Form */}
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="contact-form-panel"
          >
            <div className="glass-form-card">
              <div className="form-card-header">
                <div className="header-icon-box">
                  <FiSend className="header-icon" />
                </div>
                <div>
                  <h4>Direct Message Dispatch</h4>
                  <p>Encrypted delivery directly to inbox &amp; server telemetry</p>
                </div>
              </div>

              {isSubmitted ? (
                <div className="form-success-banner">
                  <div className="success-icon-ring">
                    <FiCheck size={28} />
                  </div>
                  <h5>Transmission Received</h5>
                  <p>Thank you for reaching out. Samyak Anand will review your request and reply shortly.</p>
                  <button
                    type="button"
                    onClick={() => setIsSubmitted(false)}
                    className="send-another-btn"
                  >
                    Send Another Message
                  </button>
                </div>
              ) : (
                <form onSubmit={sendEmail} className="contact-form-body">
                  <div className="form-field-group">
                    <label htmlFor="user_name">
                      <FiUser size={13} /> Your Name
                    </label>
                    <input
                      id="user_name"
                      type="text"
                      name="user_name"
                      value={formData.user_name}
                      onChange={handleInputChange}
                      placeholder="e.g. Elena Rostova"
                      required
                      className="glass-input"
                    />
                  </div>

                  <div className="form-field-group">
                    <label htmlFor="user_email">
                      <FiMail size={13} /> Email Address
                    </label>
                    <input
                      id="user_email"
                      type="email"
                      name="user_email"
                      value={formData.user_email}
                      onChange={handleInputChange}
                      placeholder="e.g. elena@enterprise.ai"
                      required
                      className="glass-input"
                    />
                  </div>

                  <div className="form-field-group">
                    <label htmlFor="subject">
                      <FiMessageSquare size={13} /> Subject / Inquiry Type
                    </label>
                    <input
                      id="subject"
                      type="text"
                      name="subject"
                      value={formData.subject}
                      onChange={handleInputChange}
                      placeholder="e.g. Enterprise Deployment & Architecture Consultation"
                      className="glass-input"
                    />
                  </div>

                  <div className="form-field-group">
                    <label htmlFor="message">
                      <FiShield size={13} /> Message Details
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      value={formData.message}
                      onChange={handleInputChange}
                      rows={5}
                      placeholder="Describe your datasets, business use case, or project goals..."
                      required
                      className="glass-textarea"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="glass-submit-btn"
                  >
                    {isSubmitting ? (
                      <span className="submit-loading-text">
                        <span className="submit-spinner" /> Encrypting &amp; Dispatching…
                      </span>
                    ) : (
                      <>
                        <span>Dispatch Message</span>
                        <FiSend size={15} />
                      </>
                    )}
                  </button>

                  <div className="form-security-note">
                    <FiShield size={12} />
                    <span>Protected by EmailJS 256-bit TLS dispatch &amp; server persistence</span>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
