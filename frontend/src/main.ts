import { createApp } from 'vue'
import { createHead } from '@unhead/vue/client'
import { inject } from '@vercel/analytics'
import router from './router'
import './style.css'
import App from './App.vue'

inject()

const app = createApp(App)
const head = createHead()

app.use(router)
app.use(head)
app.mount('#app')
