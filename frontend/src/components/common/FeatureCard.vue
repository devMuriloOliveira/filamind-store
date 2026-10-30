<script setup>
defineProps({
  icon: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
})
</script>

<template>
  <article class="feature-card"><span class="icon-box"><img :src="icon" alt="" width="21" height="21" loading="lazy"></span><div><h3>{{ title }}</h3><p>{{ description }}</p></div></article>
</template>
