// app.js - Fichier unique pour toute l'application

// ============================================
// 1. CONFIGURATION FIREBASE
// ============================================

const firebaseConfig = {
    apiKey: "AIzaSyA1fWfIgWgv-UagCcp9blTO8iE8AfixVNM",
    authDomain: "mlm1-598b5.firebaseapp.com",
    projectId: "mlm1-598b5",
    storageBucket: "mlm1-598b5.firebasestorage.app",
    messagingSenderId: "601982652419",
    appId: "1:601982652419:web:a34ccee92f95950a63be36",
    measurementId: "G-DLCVD2MRSC"
};

// Initialiser Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
db.settings({ timestampsInSnapshots: true });

// ============================================
// 2. VARIABLES GLOBALES
// ============================================

let currentUser = null;
let currentUserData = null;
let allMembers = [];

// ============================================
// 3. CONFIGURATION DES MENUS
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
// 4. FONCTIONS D'AUTHENTIFICATION
// ============================================

// Vérifier si l'utilisateur est connecté
async function checkAuth() {
    return new Promise((resolve) => {
        auth.onAuthStateChanged((user) => {
            currentUser = user;
            resolve(user);
        });
    });
}

// Vérifier si l'utilisateur est admin
async function isAdmin() {
    if (!currentUser) return false;
    try {
        const doc = await db.collection('users').doc(currentUser.uid).get();
        if (!doc.exists) return false;
        currentUserData = doc.data();
        return currentUserData.role === 'admin';
    } catch (error) {
        console.error('Erreur vérification admin:', error);
        return false;
    }
}

// Charger les données de l'utilisateur connecté
async function loadUserData() {
    if (!currentUser) return null;
    try {
        const doc = await db.collection('users').doc(currentUser.uid).get();
        if (doc.exists) {
            currentUserData = doc.data();
            return currentUserData;
        }
        return null;
    } catch (error) {
        console.error('Erreur chargement données utilisateur:', error);
        return null;
    }
}

// ============================================
// 5. FONCTIONS DE GESTION DES MEMBRES
// ============================================

// Charger tous les membres
async function loadAllMembers() {
    try {
        const snapshot = await db.collection('users').get();
        allMembers = [];
        snapshot.forEach(doc => {
            allMembers.push({
                id: doc.id,
                ...doc.data()
            });
        });
        return allMembers;
    } catch (error) {
        console.error('Erreur chargement membres:', error);
        return [];
    }
}

// Générer un code membre unique
async function generateMemberCode() {
    const counterRef = db.collection('counters').doc('memberCode');
    
    try {
        const result = await db.runTransaction(async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            
            let currentNumber;
            if (!counterDoc.exists) {
                currentNumber = 1;
                transaction.set(counterRef, { currentNumber });
            } else {
                currentNumber = counterDoc.data().currentNumber + 1;
                transaction.update(counterRef, { currentNumber });
            }
            
            return currentNumber;
        });
        
        return `MB${String(result).padStart(6, '0')}`;
    } catch (error) {
        console.error('Erreur génération code:', error);
        const random = Math.floor(Math.random() * 1000000);
        return `MB${String(random).padStart(6, '0')}`;
    }
}

// Rechercher la première position disponible (BFS)
async function findNextAvailablePosition(racineId) {
    if (!racineId) {
        return { parentId: null, position: null };
    }
    
    const queue = [racineId];
    const visited = new Set();
    
    while (queue.length > 0) {
        const currentId = queue.shift();
        if (visited.has(currentId)) continue;
        visited.add(currentId);
        
        try {
            const currentDoc = await db.collection('users').doc(currentId).get();
            if (!currentDoc.exists) continue;
            
            const currentData = currentDoc.data();
            
            if (!currentData.leftChildId) {
                return { parentId: currentId, position: 'left' };
            }
            queue.push(currentData.leftChildId);
            
            if (!currentData.rightChildId) {
                return { parentId: currentId, position: 'right' };
            }
            queue.push(currentData.rightChildId);
        } catch (error) {
            console.error('Erreur BFS:', error);
        }
    }
    
    return { parentId: racineId, position: 'left' };
}

// Trouver la racine
async function findRoot() {
    try {
        const racineQuery = await db.collection('users')
            .where('position', '==', null)
            .limit(1)
            .get();
        
        if (!racineQuery.empty) {
            return racineQuery.docs[0].id;
        }
        
        const firstUser = await db.collection('users')
            .orderBy('dateInscription')
            .limit(1)
            .get();
        
        if (!firstUser.empty) {
            return firstUser.docs[0].id;
        }
        
        return null;
    } catch (error) {
        console.error('Erreur recherche racine:', error);
        return null;
    }
}

// Compter les descendants d'un membre
async function countDescendants(memberId) {
    let count = 0;
    let leftCount = 0;
    let rightCount = 0;
    const queue = [memberId];
    const visited = new Set();
    
    while (queue.length > 0) {
        const currentId = queue.shift();
        if (visited.has(currentId)) continue;
        visited.add(currentId);
        
        try {
            const doc = await db.collection('users').doc(currentId).get();
            if (!doc.exists) continue;
            
            const data = doc.data();
            if (data.leftChildId) {
                count++;
                leftCount++;
                queue.push(data.leftChildId);
            }
            if (data.rightChildId) {
                count++;
                rightCount++;
                queue.push(data.rightChildId);
            }
        } catch (error) {
            console.error('Erreur comptage:', error);
        }
    }
    
    return { total: count, left: leftCount, right: rightCount };
}

// Inscription d'un membre
async function inscrireMembre(data) {
    const { email, password, nom, prenom, telephone, codeParrain } = data;
    
    if (!email || !password || !nom || !prenom || !telephone) {
        throw new Error('Tous les champs sont obligatoires');
    }
    
    const usersSnapshot = await db.collection('users').limit(1).get();
    const isFirstUser = usersSnapshot.empty;
    
    let parrainDoc = null;
    
    if (!isFirstUser) {
        if (!codeParrain) {
            throw new Error('Code parrain obligatoire');
        }
        
        const parrainQuery = await db.collection('users')
            .where('codeMembre', '==', codeParrain)
            .limit(1)
            .get();
        
        if (parrainQuery.empty) {
            throw new Error('Code parrain inexistant');
        }
        
        parrainDoc = parrainQuery.docs[0];
    }
    
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        await user.updateProfile({
            displayName: `${prenom} ${nom}`
        });
        
        const codeMembre = await generateMemberCode();
        
        let parentId = null;
        let position = null;
        let parrainId = null;
        
        if (!isFirstUser) {
            const rootId = await findRoot();
            if (rootId) {
                const positionInfo = await findNextAvailablePosition(rootId);
                parentId = positionInfo.parentId;
                position = positionInfo.position;
                parrainId = parrainDoc.id;
            }
        }
        
        const userData = {
            uid: user.uid,
            codeMembre: codeMembre,
            nom: nom,
            prenom: prenom,
            telephone: telephone,
            email: email,
            codeParrain: codeParrain || null,
            parrainId: parrainId,
            parentId: parentId,
            position: position,
            leftChildId: null,
            rightChildId: null,
            dateInscription: firebase.firestore.FieldValue.serverTimestamp(),
            statut: 'actif',
            role: isFirstUser ? 'admin' : 'member',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.runTransaction(async (transaction) => {
            transaction.set(db.collection('users').doc(user.uid), userData);
            
            if (parentId) {
                const parentRef = db.collection('users').doc(parentId);
                const updateData = {};
                if (position === 'left') {
                    updateData.leftChildId = user.uid;
                } else if (position === 'right') {
                    updateData.rightChildId = user.uid;
                }
                transaction.update(parentRef, updateData);
            }
        });
        
        return {
            success: true,
            uid: user.uid,
            codeMembre: codeMembre
        };
        
    } catch (authError) {
        console.error('Erreur Auth:', authError);
        if (authError.code === 'auth/email-already-in-use') {
            throw new Error('Cet email est déjà utilisé');
        } else if (authError.code === 'auth/weak-password') {
            throw new Error('Mot de passe trop faible (minimum 8 caractères)');
        } else if (authError.code === 'auth/invalid-email') {
            throw new Error('Email invalide');
        } else {
            throw new Error('Erreur lors de la création du compte: ' + authError.message);
        }
    }
}

// ============================================
// 6. FONCTIONS D'AFFICHAGE DU MENU
// ============================================

// Générer la sidebar
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
            <a href="#" onclick="handleLogout(event)" 
               class="flex items-center px-4 py-3 rounded-lg text-red-600 hover:bg-red-50 transition">
                <i class="fas fa-sign-out-alt w-5 h-5 mr-3"></i>
                Déconnexion
            </a>
        </div>
    `;
    
    return menuHTML;
}

// Générer la bottom nav
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
// 7. FONCTIONS DE GESTION DES ACTIONS
// ============================================

// Gestion de la déconnexion
function handleLogout(e) {
    e.preventDefault();
    if (confirm('Voulez-vous vraiment vous déconnecter ?')) {
        auth.signOut().then(() => {
            window.location.href = 'connexion.html';
        }).catch((error) => {
            console.error('Erreur déconnexion:', error);
            showToast('Erreur lors de la déconnexion', 'error');
        });
    }
}

// Ouvrir le modal d'ajout
function openAddModal(e) {
    e.preventDefault();
    const modal = document.getElementById('addMemberModal');
    if (modal) {
        modal.classList.remove('hidden');
    }
}

// Afficher une notification
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    toast.textContent = message;
    toast.className = `toast toast-${type} show`;
    setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}

// ============================================
// 8. CHARGEMENT DU MENU
// ============================================

async function loadMenu() {
    const user = await checkAuth();
    if (!user) return;
    
    const userData = await loadUserData();
    if (!userData) return;
    
    const role = userData.role === 'admin' ? 'admin' : 'member';
    const currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';
    
    // Générer la sidebar
    const sidebarHTML = generateSidebar(role, currentPage);
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.innerHTML = sidebarHTML;
    }
    
    // Générer la bottom nav
    const bottomNavHTML = generateBottomNav(role, currentPage);
    const bottomNavContainer = document.getElementById('bottomNavContainer');
    if (bottomNavContainer) {
        bottomNavContainer.innerHTML = bottomNavHTML;
    }
    
    // Mettre à jour le header
    const userNameEl = document.getElementById('userName');
    const userInitialEl = document.getElementById('userInitial');
    
    if (userNameEl) {
        userNameEl.textContent = `${userData.prenom} ${userData.nom}`;
    }
    if (userInitialEl) {
        userInitialEl.textContent = userData.prenom.charAt(0).toUpperCase();
    }
    
    // Ajouter le lien admin dans le header
    if (role === 'admin') {
        const headerRight = document.querySelector('.flex.items-center.space-x-4');
        if (headerRight) {
            // Supprimer l'ancien lien admin s'il existe
            const oldAdminLink = headerRight.querySelector('.admin-link');
            if (oldAdminLink) oldAdminLink.remove();
            
            const adminLink = document.createElement('a');
            adminLink.href = 'admin/dashboard.html';
            adminLink.className = 'admin-link text-sm text-purple-600 hover:text-purple-700 font-medium';
            adminLink.innerHTML = '<i class="fas fa-crown mr-1"></i> Admin';
            headerRight.insertBefore(adminLink, headerRight.firstChild);
        }
    }
    
    // Ajouter la classe pour la bottom nav
    document.body.classList.add('has-bottom-nav');
}

// ============================================
// 9. INITIALISATION
// ============================================

// Exposer les fonctions globalement
window.auth = auth;
window.db = db;
window.currentUser = currentUser;
window.currentUserData = currentUserData;
window.allMembers = allMembers;

window.checkAuth = checkAuth;
window.isAdmin = isAdmin;
window.loadUserData = loadUserData;
window.loadAllMembers = loadAllMembers;
window.generateMemberCode = generateMemberCode;
window.findNextAvailablePosition = findNextAvailablePosition;
window.findRoot = findRoot;
window.inscrireMembre = inscrireMembre;
window.countDescendants = countDescendants;
window.loadMenu = loadMenu;
window.handleLogout = handleLogout;
window.openAddModal = openAddModal;
window.showToast = showToast;

// Charger le menu au chargement de la page
document.addEventListener('DOMContentLoaded', function() {
    const protectedPages = ['dashboard.html', 'arbre.html', 'profil.html', 'admin/dashboard.html', 'admin/membres.html', 'admin/statistiques.html'];
    const currentPage = window.location.pathname.split('/').pop();
    
    if (protectedPages.includes(currentPage) || currentPage === '') {
        loadMenu();
    }
});