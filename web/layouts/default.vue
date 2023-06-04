<script setup lang="ts">
</script>

<template>
  <div class="flex flex-col w-full h-full">
    <Nav />

    <slot />

    <Footer />
  </div>
</template>

<style>
html,
body,
#__nuxt {
  width: 100%;
  height: 100%;
}
</style>
