"use client"
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';
import { isMobile } from 'mobile-device-detect';

const ToastContext = createContext(null);

const Toast = ({ message, type, onClose, index }) => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        setIsVisible(true);
        const timer = setTimeout(() => {
            setIsVisible(false);
            onClose();
        }, 3000); // Auto-close after 3 seconds, adjust as needed

        return () => {
            clearTimeout(timer);
            setIsVisible(false);
        };
    }, [onClose]);

    return (
        <div
            style={{
                top: `${1 + index * 3}rem`,
                position: 'fixed',
                left: isMobile ? '18%' : '40%',
                transform: 'translateX(-10%)',
                zIndex: 1000, // Ensure it appears above other content
                display: 'flex',
                alignItems: 'center', // Align items vertically in the center
                width: isMobile ? '80%' : '25%', // Adjust width as needed
                height: '40px',
                padding: '0 16px', // Add padding to the sides
            }}
            className={`bg-[#076d55] bg-opacity-80 text-white rounded-full shadow-lg transition-all duration-300 ease-in-out ${isVisible ? 'opacity-100' : 'opacity-0'
                }`}
        >
            {/* Left Side: Icon and Message */}
            <div className="flex items-center space-x-2">
                {type === 'error' ? (
                    <XCircle className="text-red-500" size={20} />
                ) : (
                    <CheckCircle2 className="text-green-500" size={20} />
                )}
                <span className="text-[12px] overflow-hidden text-ellipsis whitespace-normal break-words max-w-full">
                    {message}
                </span>
            </div>

            {/* Right Side: Close Button */}
            <button
                onClick={onClose}
                className="ml-auto text-white hover:text-gray-200 focus:outline-none"
                aria-label="Close"
            >
                <X size={15} />
            </button>
        </div>
    );
};


export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((message, type = 'success', duration = 3000) => {
        const id = Date.now();
        setToasts((prevToasts) => [...prevToasts, { id, message, type }]);
        setTimeout(() => {
            setToasts((prevToasts) =>
                prevToasts.map(toast =>
                    toast.id === id ? { ...toast, removing: true } : toast
                )
            );
            setTimeout(() => {
                setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id));
            }, 300); // Wait for exit animation
        }, duration);
    }, []);

    const removeToast = useCallback((id) => {
        setToasts((prevToasts) =>
            prevToasts.map(toast =>
                toast.id === id ? { ...toast, removing: true } : toast
            )
        );
        setTimeout(() => {
            setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id));
        }, 300); // Wait for exit animation
    }, []);

    return (
        <ToastContext.Provider value={{ addToast, removeToast }}>
            {children}
            {toasts.map((toast, index) => (
                <Toast
                    key={toast.id}
                    message={toast.message}
                    type={toast.type}
                    onClose={() => removeToast(toast.id)}
                    index={index}
                />
            ))}
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context.addToast;
};
