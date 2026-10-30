<script setup>
defineProps({
  href: { type: String, required: true },
  variant: { type: String, default: 'primary' },
})
</script>

<template>
  <a class="button" :class="`button-${variant}`" :href="href" target="_blank" rel="noopener noreferrer"><slot /></a>
</template>
