/** Small stroke icons so compact buttons stay graphical even if webfonts fail to load. */
export function UiIcon({ name }: { name: string }) {
  const common = {
    viewBox: '0 0 24 24',
    className: 'ui-icon',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (name) {
    case 'menu':
      return (
        <svg {...common}>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      );
    case 'chevron_left':
      return (
        <svg {...common}>
          <path d="M14 6l-6 6 6 6" />
        </svg>
      );
    case 'chevron_right':
      return (
        <svg {...common}>
          <path d="M10 6l6 6-6 6" />
        </svg>
      );
    case 'home':
      return (
        <svg {...common}>
          <path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
        </svg>
      );
    case 'note_add':
      return (
        <svg {...common}>
          <path d="M7 3h7l5 5v13H7z" />
          <path d="M14 3v5h5M12 13v6M9 16h6" />
        </svg>
      );
    case 'tune':
      return (
        <svg {...common}>
          <path d="M4 8h16M4 16h16M8 8v0M16 16v0" />
          <circle cx="8" cy="8" r="2" />
          <circle cx="16" cy="16" r="2" />
        </svg>
      );
    case 'keyboard':
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8" />
        </svg>
      );
    case 'menu_book':
      return (
        <svg {...common}>
          <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
          <path d="M6 3v16" />
        </svg>
      );
    case 'folder':
      return (
        <svg {...common}>
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
      );
    case 'grid_view':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="6" height="6" />
          <rect x="14" y="4" width="6" height="6" />
          <rect x="4" y="14" width="6" height="6" />
          <rect x="14" y="14" width="6" height="6" />
        </svg>
      );
    case 'view_in_ar':
      return (
        <svg {...common}>
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
          <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
        </svg>
      );
    case 'brush':
      return (
        <svg {...common}>
          <path d="M14 4l6 6-8 8H6v-6z" />
          <path d="M5 19c1.5 1 3 0 3-1.5" />
        </svg>
      );
    case 'touch_app':
      return (
        <svg {...common}>
          <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11" />
          <path d="M12 11V7.5a1.5 1.5 0 0 1 3 0V12" />
          <path d="M15 12v-1a1.5 1.5 0 0 1 3 0v4.5a5 5 0 0 1-5 5h-1.2a5 5 0 0 1-4.3-2.5L5.5 13.5a1.5 1.5 0 0 1 2.5-1.6L9 14" />
        </svg>
      );
    case 'auto_awesome':
      return (
        <svg {...common}>
          <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z" />
          <path d="M18 15l.6 1.8L20.5 17.5 18.6 18.1 18 20l-.6-1.9-1.9-.6 1.9-.7z" />
        </svg>
      );
    case 'save':
      return (
        <svg {...common}>
          <path d="M5 4h11l3 3v13H5z" />
          <path d="M8 4v5h7M8 20v-6h8v6" />
        </svg>
      );
    case 'palette':
      return (
        <svg {...common}>
          <path d="M12 4a8 8 0 1 0 0 16h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h.5" />
          <circle cx="8" cy="9" r="1" fill="currentColor" />
          <circle cx="7" cy="13" r="1" fill="currentColor" />
        </svg>
      );
    case 'undo':
      return (
        <svg {...common}>
          <path d="M8 8H4v4" />
          <path d="M4 8a8 8 0 1 1-1 5" />
        </svg>
      );
    case 'redo':
      return (
        <svg {...common}>
          <path d="M16 8h4v4" />
          <path d="M20 8a8 8 0 1 0 1 5" />
        </svg>
      );
    case 'horizontal_rule':
      return (
        <svg {...common}>
          <path d="M4 12h16" />
        </svg>
      );
    case 'fit_screen':
      return (
        <svg {...common}>
          <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />
        </svg>
      );
    case 'restart_alt':
      return (
        <svg {...common}>
          <path d="M4 12a8 8 0 1 0 2-5" />
          <path d="M4 4v5h5" />
        </svg>
      );
    case 'delete':
      return (
        <svg {...common}>
          <path d="M5 7h14M9 7V5h6v2M8 7l1 13h6l1-13" />
        </svg>
      );
    case 'arrow_right_alt':
      return (
        <svg {...common}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      );
    case 'title':
      return (
        <svg {...common}>
          <path d="M6 6h12M12 6v12" />
        </svg>
      );
    case 'cleaning_services':
      return (
        <svg {...common}>
          <path d="M8 20h8M9 16h6l1-8H8zM10 8V5h4v3" />
        </svg>
      );
    case 'add':
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case 'image':
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M8 15l3-3 2 2 3-4 3 5" />
        </svg>
      );
    case 'movie_creation':
      return (
        <svg {...common}>
          <rect x="3" y="7" width="18" height="12" rx="2" />
          <path d="M7 7l2-3M12 7l2-3M17 7l2-3" />
        </svg>
      );
    case 'close':
      return (
        <svg {...common}>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      );
    case 'aspect_ratio':
      return (
        <svg {...common}>
          <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" />
        </svg>
      );
    case 'select':
      return (
        <svg {...common}>
          <path d="M5 5h8v8H5z" strokeDasharray="3 2" />
        </svg>
      );
    case 'lasso':
      return (
        <svg {...common}>
          <path d="M6 8c2-4 10-4 12 1 1 4-2 6-5 6-2 3-6 2-7-1" />
        </svg>
      );
    case 'open_with':
      return (
        <svg {...common}>
          <path d="M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4" />
        </svg>
      );
    case 'format_color_fill':
      return (
        <svg {...common}>
          <path d="M4 16l8-10 4 4-8 10H4z" />
          <path d="M16 18h4" />
        </svg>
      );
    case 'colorize':
      return (
        <svg {...common}>
          <path d="M8 16l8-8 2 2-8 8H8z" />
          <path d="M14 6l2 2" />
          <circle cx="17" cy="7" r="1.5" />
        </svg>
      );
    case 'crop_square':
      return (
        <svg {...common}>
          <rect x="5" y="5" width="14" height="14" />
        </svg>
      );
    case 'circle':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7" />
        </svg>
      );
    case 'photo_camera':
      return (
        <svg {...common}>
          <path d="M5 8h3l2-2h4l2 2h3v10H5z" />
          <circle cx="12" cy="13" r="3" />
        </svg>
      );
    case 'layers':
      return (
        <svg {...common}>
          <path d="M12 4l8 4-8 4-8-4z" />
          <path d="M4 14l8 4 8-4" />
        </svg>
      );
    case 'chevron_down':
      return (
        <svg {...common}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      );
    case 'tool_pen':
      return (
        <svg {...common}>
          <path d="M14 4l6 6-10 10H4v-6L14 4z" />
          <path d="M12 6l6 6" />
        </svg>
      );
    case 'tool_eraser':
      return (
        <svg {...common}>
          <path d="M16 4l4 4-8 8H8l-4-4 8-8z" />
          <path d="M5 19h14" />
        </svg>
      );
    case 'tool_lasso':
      return (
        <svg {...common}>
          <path d="M7 9c1.5-4 9-4 10 1 1 4-2 6-5 6-1.5 2.5-5 2-6-1" />
          <circle cx="8" cy="16" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'tool_lasso_fill':
      return (
        <svg {...common}>
          <path d="M7 9c1.5-4 9-4 10 1 1 4-2 6-5 6-1.5 2.5-5 2-6-1" />
          <path d="M14 14l4 1-1.5 3.5z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'tool_fill':
      return (
        <svg {...common}>
          <path d="M5 14l7-9 3 3-7 9H5z" />
          <path d="M15 17c1.5 0 3 1 3 2.5S16.5 22 15 22s-3-1-3-2.5 1.5-2.5 3-2.5z" />
        </svg>
      );
    case 'tool_text':
      return (
        <svg {...common}>
          <path d="M6 6h12M12 6v14" />
        </svg>
      );
    case 'tool_line':
      return (
        <svg {...common}>
          <path d="M5 19L19 5" />
        </svg>
      );
    case 'tool_arrow':
      return (
        <svg {...common}>
          <path d="M5 12h12M13 6l6 6-6 6" />
        </svg>
      );
    case 'tool_rect':
      return (
        <svg {...common}>
          <rect x="5" y="6" width="14" height="12" />
        </svg>
      );
    case 'tool_ellipse':
      return (
        <svg {...common}>
          <ellipse cx="12" cy="12" rx="8" ry="6" />
        </svg>
      );
    case 'tool_select':
      return (
        <svg {...common}>
          <rect x="5" y="5" width="10" height="10" strokeDasharray="2 2" />
          <path d="M14 14l5 5" />
        </svg>
      );
    case 'tool_camera':
      return (
        <svg {...common}>
          <path d="M5 9h3l1.5-2h5L16 9h3v9H5z" />
          <circle cx="12" cy="13.5" r="2.5" />
        </svg>
      );
    case 'tool_move':
      return (
        <svg {...common}>
          <path d="M12 4v16M4 12h16M8 7l4-3 4 3M8 17l4 3 4-3M7 8l-3 4 3 4M17 8l3 4-3 4" />
        </svg>
      );
    case 'tool_transform':
      return (
        <svg {...common}>
          <path d="M7 7h10v10H7z" />
          <path d="M7 7l-2-2M17 7l2-2M17 17l2 2M7 17l-2 2" />
        </svg>
      );
    case 'tool_eyedropper':
      return (
        <svg {...common}>
          <path d="M7 15l8-8 2 2-8 8H7z" />
          <path d="M14 6l2 2" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
}
