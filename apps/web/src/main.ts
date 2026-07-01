import { createApp } from "vue";
import { router } from "@/router";
import App from "@/App.vue";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@/assets/css/storyframe.css";

createApp(App).use(router).mount("#app");
