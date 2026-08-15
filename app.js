// ============================================
// AJOUTER CETTE FONCTION DANS app.js
// ============================================

function getStats() {
    return new Promise(async (resolve) => {
        try {
            const snapshot = await db.collection('users').get();
            let total = 0, actifs = 0, suspendus = 0;
            let aujourdhui = 0, cetteSemaine = 0;
            
            const now = new Date();
            const today = new Date(now);
            today.setHours(0, 0, 0, 0);
            
            const weekStart = new Date(today);
            weekStart.setDate(weekStart.getDate() - 7);
            
            snapshot.forEach(doc => {
                const data = doc.data();
                total++;
                
                if (data.statut === 'actif') actifs++;
                if (data.statut === 'suspendu') suspendus++;
                
                if (data.dateInscription) {
                    const date = data.dateInscription.toDate ? data.dateInscription.toDate() : new Date(data.dateInscription);
                    if (date >= today) aujourdhui++;
                    if (date >= weekStart) cetteSemaine++;
                }
            });
            
            const tauxActivite = total > 0 ? Math.round((actifs / total) * 100) : 0;
            
            resolve({
                total,
                actifs,
                suspendus,
                aujourdhui,
                cetteSemaine,
                tauxActivite
            });
        } catch (error) {
            console.error('Erreur getStats:', error);
            resolve({
                total: 0,
                actifs: 0,
                suspendus: 0,
                aujourdhui: 0,
                cetteSemaine: 0,
                tauxActivite: 0
            });
        }
    });
}

// ============================================
// EXPOSER getStats GLOBALEMENT
// ============================================

window.getStats = getStats;