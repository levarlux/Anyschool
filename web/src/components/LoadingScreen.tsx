// Full-screen splash — animated AnySchool lockup (icon + wordmark + tagline + pills)
export default function LoadingScreen() {
  return (
    <div className="loading-screen">
      <svg className="splash-lockup" viewBox="0 0 800 220" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="sp-grad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2563EB" />
            <stop offset="100%" stopColor="#1D4ED8" />
          </linearGradient>
          <linearGradient id="sp-grad2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#60A5FA" />
          </linearGradient>
          <linearGradient id="sp-accent" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#FBBF24" />
          </linearGradient>
        </defs>

        {/* Icon Group */}
        <g transform="translate(40, 15)">
          {/* Base Ribbon/Book Pages — unfurls downward */}
          <path
            className="splash-ribbon"
            d="M 30,150 Q 100,120 100,170 Q 100,120 170,150 L 170,130 Q 100,100 100,150 Q 100,100 30,130 Z"
            fill="url(#sp-grad2)" opacity="0.85"
          />

          {/* Stylized 'A' + Mortarboard Top — cap drops in, A rises */}
          <path className="splash-cap" d="M 100,20 L 165,60 L 100,100 L 35,60 Z" fill="url(#sp-grad1)" />
          <path className="splash-a" d="M 50,70 L 100,155 L 150,70 L 128,70 L 100,120 L 72,70 Z" fill="url(#sp-grad1)" />

          {/* Connected Community Nodes — pop in staggered */}
          <circle className="splash-node splash-node-1" cx="100" cy="50" r="7" fill="url(#sp-accent)" />
          <circle className="splash-node splash-node-2" cx="45" cy="115" r="6" fill="url(#sp-accent)" />
          <circle className="splash-node splash-node-3" cx="155" cy="115" r="6" fill="url(#sp-accent)" />

          {/* Community links — fade in after nodes */}
          <line className="splash-link splash-link-1" x1="100" y1="50" x2="45" y2="115" stroke="#F59E0B" strokeWidth="2" strokeDasharray="3,3" />
          <line className="splash-link splash-link-2" x1="100" y1="50" x2="155" y2="115" stroke="#F59E0B" strokeWidth="2" strokeDasharray="3,3" />
          <line className="splash-link splash-link-3" x1="45" y1="115" x2="155" y2="115" stroke="#F59E0B" strokeWidth="2" strokeDasharray="3,3" />
        </g>

        {/* Typography */}
        <text className="splash-title" x="240" y="105" fontFamily="'Inter', system-ui, sans-serif" fontWeight="800" fontSize="58" fill="#1E293B" letterSpacing="-1">ANY SCHOOL</text>
        <text className="splash-tagline" x="242" y="140" fontFamily="'Inter', system-ui, sans-serif" fontWeight="600" fontSize="18" fill="#3B82F6" letterSpacing="4">ALL-IN-ONE SCHOOL MANAGEMENT SUITE</text>

        {/* Badge Pills — pop in one by one */}
        <g className="splash-pill splash-pill-1">
          <rect x="242" y="158" width="85" height="22" rx="11" fill="#EFF6FF" />
          <text x="284" y="173" fontFamily="'Inter', sans-serif" fontSize="11" fontWeight="600" fill="#2563EB" textAnchor="middle">TEAMS</text>
        </g>
        <g className="splash-pill splash-pill-2">
          <rect x="335" y="158" width="95" height="22" rx="11" fill="#EFF6FF" />
          <text x="382" y="173" fontFamily="'Inter', sans-serif" fontSize="11" fontWeight="600" fill="#2563EB" textAnchor="middle">TEACHERS</text>
        </g>
        <g className="splash-pill splash-pill-3">
          <rect x="438" y="158" width="90" height="22" rx="11" fill="#EFF6FF" />
          <text x="483" y="173" fontFamily="'Inter', sans-serif" fontSize="11" fontWeight="600" fill="#2563EB" textAnchor="middle">PARENTS</text>
        </g>
        <g className="splash-pill splash-pill-4">
          <rect x="536" y="158" width="95" height="22" rx="11" fill="#EFF6FF" />
          <text x="583" y="173" fontFamily="'Inter', sans-serif" fontSize="11" fontWeight="600" fill="#2563EB" textAnchor="middle">STUDENTS</text>
        </g>
        <g className="splash-pill splash-pill-5">
          <rect x="639" y="158" width="115" height="22" rx="11" fill="#FEF3C7" />
          <text x="696" y="173" fontFamily="'Inter', sans-serif" fontSize="11" fontWeight="700" fill="#D97706" textAnchor="middle">REPORT CARDS</text>
        </g>
      </svg>

      <div className="loading-bar">
        <div className="loading-bar-fill" />
      </div>
    </div>
  );
}
