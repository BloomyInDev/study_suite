<script setup lang="ts">
import LegalPage from '../components/LegalPage.vue'
import { PUBLISHER } from '../lib/legal.js'
</script>

<template>
    <LegalPage title="Conditions générales d'utilisation">
        <p>
            Tu les acceptes avec le bouton « Accepter » du bandeau en bas de page. Si tu es
            connecté·e, la version acceptée et sa date sont gardées sur ton compte.
        </p>

        <h2>1. Le service</h2>
        <p>
            Study Suite affiche l'emploi du temps de l'IUT de façon lisible, avec les salles libres,
            les enseignants, les changements de planning, les devoirs de ta classe et des rappels
            avant tes cours. C'est un projet personnel d'étudiant, gratuit, non commercial et
            indépendant de l'IUT.
        </p>

        <h2>2. Accès et compte</h2>
        <ul>
            <li>Le planning, les salles et les enseignants se consultent sans compte.</li>
            <li>
                Pour les devoirs et ton profil, tu te connectes avec Discord ou ton compte de l'IUT.
                L'app ne connaît jamais ton mot de passe.
            </li>
            <li>
                Un compte est validé automatiquement si ton rôle Discord ou ton groupe dans
                l'annuaire de l'IUT le permet, sinon par un administrateur. Il peut être refusé.
            </li>
            <li>Un compte = une personne. Tu es responsable de ce qui est fait depuis le tien.</li>
        </ul>

        <h2>3. Bon usage</h2>
        <ul>
            <li>
                Les devoirs que tu publies sont visibles par toute ta classe : ils doivent être
                exacts et respectueux. Pas d'insulte, pas de contenu sans rapport avec les cours.
            </li>
            <li>
                Pas de tentative de contourner les limites techniques ou la sécurité, d'accéder aux
                données d'autres comptes, ni de surcharger le service.
            </li>
            <li>
                Le flux iCal et l'API publique peuvent être utilisés par tes propres outils, avec
                modération.
            </li>
        </ul>

        <h2>4. Données du planning</h2>
        <p>
            Les cours viennent de l'emploi du temps en ligne de l'IUT, relu automatiquement environ
            toutes les 30 minutes, et sont repris tels quels. Ils peuvent être incomplets ou en
            retard. En cas de doute ou d'écart, l'emploi du temps officiel de l'IUT fait foi.
        </p>

        <h2>5. Administration</h2>
        <p>
            Les administrateurs valident les comptes, choisissent leur rôle et leur classe, et
            peuvent modifier ou supprimer un devoir. Ils ne peuvent pas agir en ton nom.
        </p>

        <h2>6. Disponibilité et responsabilité</h2>
        <p>
            Le service est fourni gratuitement, en l'état, sans garantie de disponibilité ni
            d'exactitude. Il peut être interrompu, modifié ou arrêté à tout moment, notamment si le
            site de l'IUT change. Dans les limites permises par la loi, l'éditeur n'est pas
            responsable d'un cours manqué, d'un rappel non reçu ou d'une erreur de planning :
            vérifie les informations importantes sur l'emploi du temps officiel.
        </p>

        <h2>7. Données personnelles</h2>
        <p>
            Ce que l'app garde, pourquoi, combien de temps et tes droits :
            <router-link to="/privacy">politique de confidentialité</router-link>.
        </p>

        <h2>8. Fin d'utilisation</h2>
        <ul>
            <li>
                Tu peux faire supprimer ton compte à tout moment en écrivant à
                <a :href="`mailto:${PUBLISHER.email}`">{{ PUBLISHER.email }}</a
                >.
            </li>
            <li>Un compte qui ne respecte pas ces conditions peut être refusé ou supprimé.</li>
        </ul>

        <h2>9. Évolution des conditions</h2>
        <p>
            Ces conditions peuvent évoluer. La version en vigueur est datée en haut de cette page.
            Une nouvelle version t'est présentée à ta visite suivante, dans le même bandeau.
        </p>

        <h2>10. Droit applicable et contact</h2>
        <p>
            Ces conditions sont soumises au droit français. En cas de désaccord, une solution
            amiable est cherchée en priorité ; à défaut, les tribunaux français sont compétents.
        </p>
        <p>
            Contact : <a :href="`mailto:${PUBLISHER.email}`">{{ PUBLISHER.email }}</a>
        </p>
    </LegalPage>
</template>
