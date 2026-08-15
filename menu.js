// menu.js - Gestion du menu unifié avec Bottom Nav

// ============================================
// CONFIGURATION DU MENU
// ============================================

const menuConfig = {
    member: {
        title: 'Mon Espace',
        bottomNav: [
            { icon: 'fa-home', label: 'Accueil', url: 'dashboard.html' },
            { icon: 'fa-sitemap', label: 'Arbre', url: 'arbre.html' },
            { icon: 'fa-user', label: 'Profil', url: 'profil.html' }
        ],
        sidebarLinks: [
            { icon: 'fa-home', label: 'Dashboard', url: 'dashboard.html' },
            { icon: 'fa-sitemap', label: 'Mon Arbre', url: 'arbre.html' },
            { icon: 'fa-user', label: 'Mon Profil', url: 'profil.html' }
        ]
    },
    admin: {
        title: 'Administration',
        bottomNav: [
            { icon: 'fa-chart-pie', label: 'Dashboard', url: 'admin/dashboard.html' },
            { icon: 'fa-users', label: 'Membres', url: 'admin/membres.html' },
            { icon: 'fa-chart-bar', label: 'Stats', url: 'admin/statistiques.html' }
        ],
        sidebarLinks: [
            { icon: 'fa-chart-pie', label: 'Dashboard', url: 'admin/dashboard.html' },
            { icon: 'fa-users', label: 'Membres', url: 'admin/membres.html' },
            { icon: 'fa-user-plus', label: 'Ajouter Membre', url: '#', id: 'ajouterMembreBtn' },
            { icon: 'fa-chart-bar', label: 'Statistiques', url: 'admin/statistiques.html' },
            { icon: 'fa-arrow-left', label: 'Retour', url: '../dashboard.html' }
        ]
    }
};

// ============================================
// GÉNÉRATION DE LA SIDEBAR (DESKTOP)
// ============================================

function generateSidebar(role, currentPage) {
    const config = role === 'admin' ? menuConfig.admin : menuConfig.member;
    
    let menuHTML = `
        <div class="flex items-center justify-center h-16 border-b">
            <i class="fas fa-tree text-blue-600 text-2xl mr-2"></i>
            <span class="text-xl font-bold text-gray-800">CommunityTree</span>
        </div>
        <div class="px-4 py-2 border-b">
            <p class="text-xs text-gray-500 uppercase tracking-wider">${config.title}</p>
        </div>
        <nav class="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
    `;
    
    config.sidebarLinks.forEach(link => {
        const isActive = currentPage === link.url || (link.url === '#' && currentPage === link.id);
        const activeClass = isActive ? 'active' : '';
        const extraClass = link.class || '';
        
        let onclick = '';
        let href = link.url;
        let idAttr = link.id ? `id="${link.id}"` : '';
        
        if (link.id === 'logoutBtn') {
            onclick = 'onclick="handleLogout(event)"';
        }
        if (link.id === 'ajouterMembreBtn') {
            onclick = 'onclick="openAddModal(event)"';
        }
        if (link.url === '#') {
            href = 'javascript:void(0)';
        }
        
        menuHTML += `
            <a href="${href}" 
               ${idAttr} 
               ${onclick}
               class="sidebar-link flex items-center px-4 py-3 rounded-lg text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition ${extraClass} ${activeClass}">
                <i class="fas ${link.icon} w-5 h-5 mr-3"></i>
                ${link.label}
            </a>
        `;
    });
    
    menuHTML += `
        </nav>
        <div class="p-4 border-t">
            <a href="#" id="logoutBtnSidebar" onclick="handleLogout(event)" 
               class="flex items-center px-4 py-3 rounded-lg text-red-600 hover:bg-red-50 transition">
                <i class="fas fa-sign-out-alt w-5 h-5 mr-3"></i>
                Déconnexion
            </a>
        </div>
    `;
    
    return menuHTML;
}

// ============================================
// GÉNÉRATION DE LA BOTTOM NAV (MOBILE)
// ============================================

function generateBottomNav(role, currentPage) {
    const config = role === 'admin' ? menuConfig.admin : menuConfig.member;
    
    let navHTML = `
        <div class="bottom-nav fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 md:hidden">
            <div class="flex justify-around items-center h-16">
    `;
    
    config.bottomNav.forEach(link => {
        const isActive = currentPage === link.url;
        const activeClass = isActive ? 'text-blue-600' : 'text-gray-500';
        
        navHTML += `
            <a href="${link.url}" 
               class="flex flex-col items-center justify-center flex-1 h-full ${activeClass} hover:text-blue-600 transition">
                <i class="fas ${link.icon} text-xl"></i>
                <span class="text-xs mt-1">${link.label}</span>
            </a>
        `;
    });
    
    // Ajouter le bouton de déconnexion dans la bottom nav
    navHTML += `
            <a href="#" onclick="handleLogout(event)" 
               class="flex flex-col items-center justify-center flex-1 h-full text-red-500 hover:text-red-600 transition">
                <i class="fas fa-sign-out-alt text-xl"></i>
                <span class="text-xs mt-1">Déco</span>
            </a>
    `;
    
    navHTML += `
            </div>
        </div>
    `;
    
    return navHTML;
}

// ============================================
// FONCTION DE DÉCONNEXION
// ============================================

function handleLogout(e) {
    e.preventDefault();
    if (confirm('Voulez-vous vraiment vous déconnecter ?')) {
        auth.signOut().then(() => {
            window.location.href = '../connexion.html';
        }).catch((error) => {
            console.error('Erreur déconnexion:', error);
            showToast('Erreur lors de la déconnexion', 'error');
        });
    }
}

// ============================================
// FONCTION D'AJOUT DE MEMBRE (MODAL)
// ============================================

function openAddModal(e) {
    e.preventDefault();
    const modal = document.getElementById('addMemberModal');
    if (modal) {
        modal.classList.remove('hidden');
    }
}

// ============================================
// CHARGEMENT DU MENU
// ============================================

async function loadMenu() {
    // Vérifier si l'utilisateur est connecté
    const user = await checkAuth();
    if (!user) return;
    
    // Charger les données utilisateur
    const userData = await loadUserData();
    if (!userData) return;
    
    // Déterminer le rôle
    const role = userData.role === 'admin' ? 'admin' : 'member';
    
    // Déterminer la page actuelle
    const currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';
    
    // Générer la sidebar (desktop)
    const sidebarHTML = generateSidebar(role, currentPage);
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.innerHTML = sidebarHTML;
    }
    
    // Générer la bottom nav (mobile)
    const bottomNavHTML = generateBottomNav(role, currentPage);
    const bottomNavContainer = document.getElementById('bottomNavContainer');
    if (bottomNavContainer) {
        bottomNavContainer.innerHTML = bottomNavHTML;
    }
    
    // Mettre à jour le nom et l'initial dans le header
    const userNameEl = document.getElementById('userName');
    const userInitialEl = document.getElementById('userInitial');
    
    if (userNameEl) {
        userNameEl.textContent = `${userData.prenom} ${userData.nom}`;
    }
    if (userInitialEl) {
        userInitialEl.textContent = userData.prenom.charAt(0).toUpperCase();
    }
    
    // Si c'est l'admin, ajouter le lien vers l'admin dans le header
    if (role === 'admin') {
        const headerRight = document.querySelector('.flex.items-center.space-x-4');
        if (headerRight) {
            const adminLink = document.createElement('a');
            adminLink.href = 'admin/dashboard.html';
            adminLink.className = 'text-sm text-purple-600 hover:text-purple-700 font-medium';
            adminLink.innerHTML = '<i class="fas fa-crown mr-1"></i> Admin';
            headerRight.insertBefore(adminLink, headerRight.firstChild);
        }
    }
    
    // Ajouter la classe pour compenser la bottom nav sur mobile
    document.body.classList.add('has-bottom-nav');
}

// ============================================
// INITIALISATION
// ============================================

// Charger le menu au chargement de la page
document.addEventListener('DOMContentLoaded', function() {
    // Vérifier si on est sur une page protégée
    const protectedPages = ['dashboard.html', 'arbre.html', 'profil.html', 'admin/dashboard.html', 'admin/membres.html', 'admin/statistiques.html'];
    const currentPage = window.location.pathname.split('/').pop();
    
    if (protectedPages.includes(currentPage) || currentPage === '') {
        loadMenu();
    }
});

// Exposer les fonctions globalement
window.loadMenu = loadMenu;
window.handleLogout = handleLogout;
window.openAddModal = openAddModal;