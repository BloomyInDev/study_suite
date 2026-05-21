import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createVuetify } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi'
import { fa } from 'vuetify/iconsets/fa'
import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import '@fortawesome/fontawesome-free/css/all.min.css'
import './styles.css'
import App from './App.vue'
import { router } from './router.js'

const savedTheme = localStorage.getItem('study_suite_theme') ?? 'light'

const vuetify = createVuetify({
  theme: { defaultTheme: savedTheme },
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: { mdi, fa },
  },
})

createApp(App).use(createPinia()).use(router).use(vuetify).mount('#app')
