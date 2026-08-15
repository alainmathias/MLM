// config.js - Configuration partagée pour toutes les pages

// ============================================
// CONFIGURATION FIREBASE
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

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
db.settings({ timestampsInSnapshots: true });

// ============================================
// VARIABLES GLOBALES
// ============================================

let currentUser = null;
let currentUserData = null;
let allMembers = [];

// ============================================
// FONCTIONS UTILITAIRES
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

// ============================================
// FONCTIONS D'INSCRIPTION
// ============================================

// Inscription d'un membre (sans Cloud Functions)
async function inscrireMembre(data) {
    const { email, password, nom, prenom, telephone, codeParrain } = data;
    
    // Validation
    if (!email || !password || !nom || !prenom || !telephone) {
        throw new Error('Tous les champs sont obligatoires');
    }
    
    // Vérifier si c'est le premier utilisateur
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
    
    // Créer l'utilisateur Firebase Auth
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
// FONCTIONS DE GESTION DES MEMBRES
// ============================================

// Suspendre/Réactiver un membre
async function toggleMemberStatus(memberId) {
    try {
        const doc = await db.collection('users').doc(memberId).get();
        if (!doc.exists) throw new Error('Membre non trouvé');
        
        const currentStatus = doc.data().statut;
        const newStatus = currentStatus === 'actif' ? 'suspendu' : 'actif';
        
        await db.collection('users').doc(memberId).update({
            statut: newStatus,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Recharger les membres
        await loadAllMembers();
        
        return { success: true, newStatus };
    } catch (error) {
        console.error('Erreur mise à jour statut:', error);
        throw error;
    }
}

// Obtenir les statistiques
async function getStats() {
    try {
        await loadAllMembers();
        
        const total = allMembers.length;
        const actifs = allMembers.filter(m => m.statut === 'actif').length;
        const suspendus = allMembers.filter(m => m.statut === 'suspendu').length;
        
        const now = new Date();
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        
        const weekStart = new Date(today);
        weekStart.setDate(weekStart.getDate() - 7);
        
        const aujourdhui = allMembers.filter(m => {
            if (!m.dateInscription) return false;
            const date = m.dateInscription.toDate ? m.dateInscription.toDate() : new Date(m.dateInscription);
            return date >= today;
        }).length;
        
        const cetteSemaine = allMembers.filter(m => {
            if (!m.dateInscription) return false;
            const date = m.dateInscription.toDate ? m.dateInscription.toDate() : new Date(m.dateInscription);
            return date >= weekStart;
        }).length;
        
        const tauxActivite = total > 0 ? Math.round((actifs / total) * 100) : 0;
        
        return {
            total,
            actifs,
            suspendus,
            aujourdhui,
            cetteSemaine,
            tauxActivite
        };
    } catch (error) {
        console.error('Erreur statistiques:', error);
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

// ============================================
// EXPORT POUR UTILISATION DANS LES PAGES
// ============================================

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
window.toggleMemberStatus = toggleMemberStatus;
window.getStats = getStats;
window.countDescendants = countDescendants;