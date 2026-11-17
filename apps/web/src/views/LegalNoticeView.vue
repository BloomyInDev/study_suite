<script setup lang="ts">
import LegalPage from '../components/LegalPage.vue'
import { HOST, PUBLISHER } from '../lib/legal.js'
</script>

<template>
    <LegalPage title="Mentions légales">
        <p>
            Qui édite et qui héberge ce site (loi pour la confiance dans l'économie numérique, art.
            1-1).
        </p>

        <h2>Édition</h2>
        <p>
            Study Suite est un projet personnel d'étudiant, édité à titre non professionnel et sans
            but lucratif, par {{ PUBLISHER.name }}.
        </p>
        <p>
            Comme la loi le permet à un éditeur non professionnel (LCEN, art. 1-1, II), ses
            coordonnées personnelles ne sont pas publiées ici : elles sont communiquées à
            l'hébergeur.
        </p>
        <p>
            Contact : <a :href="`mailto:${PUBLISHER.email}`">{{ PUBLISHER.email }}</a>
        </p>

        <h2>Hébergement</h2>
        <p>
            {{ HOST.name }}<br />
            {{ HOST.city }}<br />
            <a :href="`mailto:${HOST.email}`">{{ HOST.email }}</a>
        </p>

        <h2>Projet indépendant de l'IUT</h2>
        <p>
            Study Suite n'est ni édité, ni validé, ni soutenu par l'IUT de Montpellier-Sète ou
            l'Université de Montpellier. Le nom « IUT » sert seulement à indiquer d'où viennent les
            données. L'emploi du temps officiel de l'IUT fait foi en cas d'écart.
        </p>

        <h2>Code source</h2>
        <p>
            Le code est publié sous licence Apache 2.0 sur
            <a href="https://github.com/BloomyInDev/study_suite" target="_blank" rel="noopener"
                >GitHub</a
            >.
        </p>

        <h2>Données personnelles</h2>
        <p>
            Ce que l'app garde, pourquoi, combien de temps et tes droits :
            <router-link to="/privacy">politique de confidentialité</router-link>.
        </p>
    </LegalPage>
</template>
