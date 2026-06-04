// Theme toggle handler
document.addEventListener('DOMContentLoaded', function() {
    const themeToggle = document.getElementById('theme-toggle');
    const darkIcon = document.getElementById('theme-toggle-dark-icon');
    const lightIcon = document.getElementById('theme-toggle-light-icon');
    
    if (!themeToggle || !darkIcon || !lightIcon) return;
    
    // Update icons based on current theme
    function updateThemeIcons() {
        const isDark = document.documentElement.classList.contains('dark');
        if (isDark) {
            darkIcon.style.display = 'none';
            lightIcon.style.display = 'block';
        } else {
            darkIcon.style.display = 'block';
            lightIcon.style.display = 'none';
        }
    }
    
    // Set initial icon state
    updateThemeIcons();
    
    // Handle theme toggle
    themeToggle.addEventListener('click', function() {
        const isDark = document.documentElement.classList.contains('dark');
        
        if (isDark) {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        } else {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        }
        
        updateThemeIcons();
        themeToggle.blur();
    });
}); 