// src/components/UI/Modal.jsx
import React, { useEffect, useRef } from "react";
import { FiX } from "react-icons/fi";

/**
 * Centred dialog.
 *
 * The previous version switched the flex container to `block` at the `sm`
 * breakpoint, which silently disabled `justify-center` on every screen wider
 * than 640px, and put `w-full` on the panel while the max-width sat on its
 * child — so the white panel stretched edge to edge with its content pinned to
 * the left. It looked centred only on a phone.
 */
const Modal = ({ isOpen, onClose, title, children, size = "md" }) => {
  const panelRef = useRef(null);

  // Escape closes the dialog. Staff work through these screens at speed and
  // reaching for the mouse to dismiss a dialog is the kind of friction that
  // makes a tool feel unfinished.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);

    // Stop the page behind from scrolling while a dialog is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizes = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 bg-gray-900/50 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="flex min-h-full items-center justify-center p-4">
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={typeof title === "string" ? title : undefined}
          className={`relative w-full ${sizes[size]} transform rounded-exam bg-white text-left
                      shadow-xl outline-none transition-all`}
        >
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <button onClick={onClose} aria-label="Close" className="text-gray-400 transition-colors hover:text-gray-600">
              <FiX className="text-xl" />
            </button>
          </div>
          <div className="px-6 py-4">{children}</div>
        </div>
      </div>
    </div>
  );
};

export default Modal;
