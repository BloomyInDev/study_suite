<script setup lang="ts">
import LegalPage from '../components/LegalPage.vue'
import { HOST, PUBLISHER } from '../lib/legal.js'
</script>

<template>
    <LegalPage title="Politique de confidentialité">
        <p>
            Ce que l'app garde sur toi, pourquoi, combien de temps, et tes droits (RGPD, art. 13 et
            14).
        </p>

        <h2>Qui traite tes données</h2>
        <p>
            Study Suite est un projet personnel, gratuit et non commercial. Le responsable du
            traitement est son éditeur, {{ PUBLISHER.name }}, joignable à
            <a :href="`mailto:${PUBLISHER.email}`">{{ PUBLISHER.email }}</a
            >. L'app n'est pas éditée par l'IUT.
        </p>

        <h2>Sans compte</h2>
        <p>
            Le planning, les salles et les enseignants se consultent sans compte. Rien n'est alors
            enregistré sur le serveur à ton sujet, en dehors des journaux techniques (voir plus
            bas). Tes réglages restent dans ton navigateur (voir « Stockage local »).
        </p>

        <h2>Avec un compte</h2>
        <p>
            Tu te connectes avec Discord ou avec ton compte de l'IUT. L'app ne voit jamais ton mot
            de passe : c'est Discord ou l'annuaire de l'IUT qui le vérifie, puis qui lui transmet :
        </p>
        <ul>
            <li>
                <strong>Discord</strong> : ton identifiant, ton pseudo et ton avatar, ainsi qu'un
                jeton d'accès qui sert à lire tes rôles sur les serveurs Discord de la promo, pour
                valider ton compte et choisir ta classe.
            </li>
            <li>
                <strong>IUT</strong> : ton identifiant, ton nom affiché, ton email et ta fiche dans
                l'annuaire (qui indique ton année). Tes groupes dans l'annuaire servent à valider
                ton compte et ne sont pas gardés.
            </li>
        </ul>
        <p>L'app garde aussi :</p>
        <ul>
            <li>l'état de ton compte (en attente, validé, refusé), ton rôle et ta classe ;</li>
            <li>la version des conditions d'utilisation que tu as acceptée, et sa date ;</li>
            <li>
                les devoirs que tu crées ou modifies (avec ton nom comme auteur) et ceux que tu
                coches comme faits.
            </li>
        </ul>

        <h2>Rappels de cours</h2>
        <p>
            Si tu actives les rappels, ton navigateur crée un abonnement de notification (une
            adresse chez Google, Mozilla ou Apple, et des clés de chiffrement). L'app le garde avec
            tes groupes, les cours que tu as masqués et le délai choisi, et note chaque rappel
            envoyé pour ne pas l'envoyer deux fois. Le contenu des notifications est chiffré : le
            service de ton navigateur le transmet sans pouvoir le lire. Un compte n'est pas
            nécessaire.
        </p>

        <h2>Enseignants</h2>
        <p>
            Le nom des enseignants et leurs cours viennent de l'emploi du temps de l'IUT et sont
            affichés tels quels. Si tu es enseignant·e et que tu veux t'opposer à cet affichage,
            écris au responsable du traitement (voir « Tes droits »).
        </p>

        <h2>Pourquoi</h2>
        <ul>
            <li>
                Te fournir le service : ton compte, ton planning, tes devoirs et tes rappels. Base
                légale : exécution des conditions d'utilisation (art. 6.1.b).
            </li>
            <li>
                Réserver les comptes aux étudiants et enseignants concernés, grâce à tes rôles
                Discord ou à tes groupes dans l'annuaire. Base légale : intérêt légitime (art.
                6.1.f).
            </li>
            <li>
                Afficher l'emploi du temps des enseignants et des salles. Base légale : intérêt
                légitime (art. 6.1.f).
            </li>
            <li>
                Sécuriser le service et diagnostiquer les pannes (journaux techniques). Base légale
                : intérêt légitime (art. 6.1.f).
            </li>
            <li>
                Garder la preuve de ton acceptation des conditions d'utilisation. Base légale :
                intérêt légitime (art. 6.1.f).
            </li>
        </ul>
        <p>Aucune publicité, aucun profilage, aucune revente.</p>

        <h2>Qui y a accès</h2>
        <ul>
            <li>
                Toi, et les administrateurs de l'app, qui voient la liste des comptes (nom, avatar,
                état, rôle, classe) pour les valider. Ils ne voient pas tes jetons d'accès.
            </li>
            <li>
                Les membres de ta classe voient les devoirs que tu crées, avec ton nom comme auteur.
            </li>
            <li>
                Le bot Discord de la promo, si ton compte Discord est lié : il peut consulter et
                modifier tes devoirs en ton nom quand tu le lui demandes sur Discord. Il n'a jamais
                accès à l'administration.
            </li>
            <li>
                L'hébergeur du site, {{ HOST.name }}, qui stocke les données pour le compte du
                responsable (sous-traitant, art. 28).
            </li>
            <li>
                Discord et le service de connexion de l'IUT, au moment où tu te connectes avec eux.
            </li>
            <li>
                Le service de notification de ton navigateur (Google, Mozilla ou Apple), si tu
                actives les rappels.
            </li>
        </ul>
        <p>
            Le flux iCal (calendar.ics) ne contient que l'emploi du temps public, rien de ton
            compte.
        </p>

        <h2>Combien de temps</h2>
        <ul>
            <li>Compte : jusqu'à ce que tu demandes sa suppression.</li>
            <li>
                Jeton d'accès Discord : remplacé à chaque connexion, il expire au bout de 7 jours.
            </li>
            <li>
                Session de connexion : 7 jours, prolongée à chaque visite. La déconnexion l'efface
                de ton navigateur.
            </li>
            <li>
                Abonnement aux rappels : jusqu'à ce que tu les désactives, ou jusqu'à ce que ton
                navigateur le révoque. Les rappels envoyés sont oubliés après 7 jours.
            </li>
            <li>
                Devoirs : tant qu'ils restent utiles à la classe. Si ton compte est supprimé, ton
                nom en est retiré.
            </li>
            <li>
                Journaux techniques du serveur (adresse IP, page demandée, navigateur) : effacés à
                chaque mise à jour du serveur. L'hébergeur garde ses propres journaux.
            </li>
        </ul>

        <h2>Stockage local</h2>
        <p>
            L'app garde dans ton navigateur (localStorage) ta session, ton thème, ton acceptation
            des conditions d'utilisation, les groupes choisis, les cours que tu as masqués et le
            délai de tes rappels. Rien n'en sort, sauf la session, envoyée à l'app pour
            t'identifier. Un seul cookie, strictement nécessaire, protège la connexion avec l'IUT et
            expire après 10 minutes. Aucun traceur, aucune mesure d'audience : pas de consentement à
            recueillir.
        </p>

        <h2>Tes droits</h2>
        <p>
            Tu peux demander l'accès à tes données, leur rectification, leur effacement ou leur
            portabilité, limiter un traitement ou t'opposer à un traitement fondé sur l'intérêt
            légitime (art. 15 à 21). Écris à
            <a :href="`mailto:${PUBLISHER.email}`">{{ PUBLISHER.email }}</a> depuis une adresse ou
            un compte qui permet de vérifier que c'est bien toi : réponse sous un mois (art. 12.3).
        </p>
        <p>
            Tu peux désactiver les rappels et changer de classe à tout moment depuis ta page Profil.
            Tu peux aussi saisir la CNIL (<a
                href="https://www.cnil.fr/fr/plaintes"
                target="_blank"
                rel="noopener"
                >cnil.fr/plaintes</a
            >).
        </p>
    </LegalPage>
</template>
