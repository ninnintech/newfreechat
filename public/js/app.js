// Global app functionality

// Utility functions
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Error handling
function showError(message) {
    console.error(message);
    // You could implement a toast notification system here
}

// Loading state management
function setLoading(element, isLoading) {
    if (isLoading) {
        element.disabled = true;
        element.classList.add('loading');
    } else {
        element.disabled = false;
        element.classList.remove('loading');
    }
}

// Local storage helpers
function saveToStorage(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
        console.error('Failed to save to localStorage:', error);
    }
}

function loadFromStorage(key) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    } catch (error) {
        console.error('Failed to load from localStorage:', error);
        return null;
    }
}

// Character data
const CHARACTER_DATA = {
    'A': {
        name: 'あかり',
        description: '明るく元気な女の子',
        image: '/images/character-a.jpg'
    },
    'B': {
        name: 'みゆき',
        description: 'クールで少しミステリアスな女の子',
        image: '/images/character-b.jpg'
    },
    'C': {
        name: 'さくら',
        description: '優しくおっとりしたお姉さん',
        image: '/images/character-c.jpg'
    }
};

// Animation helpers
function fadeIn(element, duration = 300) {
    element.style.opacity = '0';
    element.style.display = 'block';
    
    let start = null;
    function animate(timestamp) {
        if (!start) start = timestamp;
        const progress = timestamp - start;
        const opacity = Math.min(progress / duration, 1);
        
        element.style.opacity = opacity;
        
        if (progress < duration) {
            requestAnimationFrame(animate);
        }
    }
    
    requestAnimationFrame(animate);
}

function fadeOut(element, duration = 300) {
    let start = null;
    const initialOpacity = parseFloat(getComputedStyle(element).opacity);
    
    function animate(timestamp) {
        if (!start) start = timestamp;
        const progress = timestamp - start;
        const opacity = Math.max(initialOpacity - (progress / duration), 0);
        
        element.style.opacity = opacity;
        
        if (progress < duration) {
            requestAnimationFrame(animate);
        } else {
            element.style.display = 'none';
        }
    }
    
    requestAnimationFrame(animate);
}

// Smooth scroll to bottom for chat
function scrollToBottom(element, smooth = true) {
    if (smooth) {
        element.scrollTo({
            top: element.scrollHeight,
            behavior: 'smooth'
        });
    } else {
        element.scrollTop = element.scrollHeight;
    }
}

// Format time for messages
function formatTime(date) {
    return date.toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Validate message input
function validateMessage(message) {
    if (!message || message.trim().length === 0) {
        return { valid: false, error: 'メッセージを入力してください' };
    }
    
    if (message.length > 500) {
        return { valid: false, error: 'メッセージは500文字以内で入力してください' };
    }
    
    return { valid: true };
}

// Rate limiting helper
function isRateLimited(lastRequestTime, minInterval = 1000) {
    const now = Date.now();
    return (now - lastRequestTime) < minInterval;
}

// Network status detection
function isOnline() {
    return navigator.onLine;
}

// Add network status listeners
window.addEventListener('online', function() {
    console.log('Network connection restored');
    // You could show a notification here
});

window.addEventListener('offline', function() {
    console.log('Network connection lost');
    // You could show a notification here
});

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Copy text to clipboard
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (error) {
        console.error('Failed to copy to clipboard:', error);
        return false;
    }
}

// Mobile detection
function isMobile() {
    return window.innerWidth <= 768;
}

// Resize handler
let resizeTimeout;
window.addEventListener('resize', function() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(function() {
        // Handle responsive changes
        const isMobileNow = isMobile();
        document.body.classList.toggle('mobile', isMobileNow);
        document.body.classList.toggle('desktop', !isMobileNow);
    }, 250);
});

// Initialize responsive classes
document.addEventListener('DOMContentLoaded', function() {
    const isMobileNow = isMobile();
    document.body.classList.toggle('mobile', isMobileNow);
    document.body.classList.toggle('desktop', !isMobileNow);
});

// Export for use in other scripts
window.AppUtils = {
    debounce,
    showError,
    setLoading,
    saveToStorage,
    loadFromStorage,
    CHARACTER_DATA,
    fadeIn,
    fadeOut,
    scrollToBottom,
    formatTime,
    validateMessage,
    isRateLimited,
    isOnline,
    escapeHtml,
    copyToClipboard,
    isMobile
};
