import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createVuetify } from 'vuetify'
import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import './styles.css'
import App from './App.vue'
import { router } from './router.js'

const savedTheme = localStorage.getItem('study_suite_theme') ?? 'light'

const vuetify = createVuetify({
  theme: { defaultTheme: savedTheme },
})

createApp(App).use(createPinia()).use(router).use(vuetify).mount('#app')
