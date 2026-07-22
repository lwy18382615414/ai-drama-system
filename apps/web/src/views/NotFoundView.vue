<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <section style="padding: 48px; text-align: center">
    <h1 style="font-size: 20px; color: #1f2225">页面不存在</h1>
    <RouterLink :to="{ name: 'projects' }" style="color: #18a058">返回项目列表</RouterLink>
  </section>
</template>
