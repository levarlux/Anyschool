import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Bot, User, Lightbulb, BarChart3, FileText, Users } from 'lucide-react';
import ASSpinner from './ASSpinner';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  { icon: BarChart3, label: 'Show learner enrollment trends', color: '#3b82f6' },
  { icon: Users, label: 'List all teachers in Science department', color: '#f59e0b' },
  { icon: FileText, label: 'Generate a report card for Class 5A', color: '#22c55e' },
  { icon: Lightbulb, label: 'Which learners need attention?', color: '#a855f7' },
];

export default function SmartAssist() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! I am SmartAssist, your AI-powered school management companion. I can help you analyze data, generate reports, answer questions about your school, and suggest actions. What would you like to do today?' },
  ]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typing]);

  const sendMessage = (text?: string) => {
    const msg = text || input.trim();
    if (!msg) return;
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setInput('');
    setTyping(true);

    setTimeout(() => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: getSmartResponse(msg),
      }]);
      setTyping(false);
    }, 1200 + Math.random() * 800);
  };

  return (
    <div className="page-enter assistant-page">
      <div className="assistant-header">
        <div className="assistant-header-icon">
          <Sparkles size={22} />
        </div>
        <div>
          <h2>SmartAssist</h2>
          <p className="text-muted">AI-powered insights for your school</p>
        </div>
        <div className="assistant-badge">
          <span className="badge badge-success">Online</span>
        </div>
      </div>

      <div className="assistant-container card">
        <div className="assistant-messages" ref={scrollRef}>
          {messages.map((msg, i) => (
            <div key={i} className={`assistant-message ${msg.role}`}>
              <div className="message-avatar">
                {msg.role === 'assistant' ? <Bot size={16} /> : <User size={16} />}
              </div>
              <div className="message-bubble">
                {msg.content}
              </div>
            </div>
          ))}
          {typing && (
            <div className="assistant-message assistant">
              <div className="message-avatar">
                <Bot size={16} />
              </div>
              <div className="message-bubble typing">
                <ASSpinner size="sm" />
                Thinking...
              </div>
            </div>
          )}
        </div>

        {messages.length <= 1 && (
          <div className="assistant-suggestions">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                className="suggestion-chip"
                onClick={() => sendMessage(s.label)}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <s.icon size={14} style={{ color: s.color }} />
                {s.label}
              </button>
            ))}
          </div>
        )}

        <div className="assistant-input-bar">
          <input
            className="assistant-input"
            placeholder="Ask SmartAssist anything..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
          />
          <button
            className="assistant-send"
            onClick={() => sendMessage()}
            disabled={!input.trim() || typing}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function getSmartResponse(input: string): string {
  const lower = input.toLowerCase();
  if (lower.includes('enrollment') || lower.includes('trend')) {
    return 'Based on the current data, your school has seen a 12% increase in enrollment over the last 3 terms. The peak enrollment period is January, with 68% of new admissions happening in Q1. I recommend preparing additional classroom capacity for the upcoming term.';
  }
  if (lower.includes('teacher') || lower.includes('staff')) {
    return 'I found 12 teachers currently assigned. The Science department has 4 teachers covering Physics, Chemistry, and Biology. Would you like me to generate a workload distribution report or check for scheduling conflicts?';
  }
  if (lower.includes('report') || lower.includes('card')) {
    return 'I can generate report cards for any class. For Class 5A, I have data for 32 learners across 8 subjects. The average score is 74.3%. Would you like me to generate the full report cards, or would you prefer a summary first?';
  }
  if (lower.includes('attention') || lower.includes('struggling')) {
    return 'I identified 5 learners who may need attention based on declining performance: Sarah M. (-12%), James K. (-8%), Faith W. (-15%), Brian O. (-6%), and Grace N. (-9%). I recommend scheduling parent conferences for the top 3. Would you like me to generate notification letters?';
  }
  return 'That is a great question! Based on the data available in your school system, I can help you with that. Could you provide a bit more detail about what you would like to know? For example, I can analyze enrollment trends, generate reports, check schedules, or identify learners who may need extra support.';
}
