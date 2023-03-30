<script setup lang="ts">

</script>

<template>
  <nav class="flex items-end mx-2 mb-2 h-8 font-quicksand">
    <div class="flex-1 mr-auto text-xl text-zinc-800 font-medium">
      Cotrans
    </div>

    <div class="flex-auto flex justify-center gap-4">
      <NuxtLink class="nav-link" to="/">
        Translator
      </NuxtLink>

      <NuxtLink class="nav-link" target="_blank" to="https://greasyfork.org/scripts/437569">
        UserScript
      </NuxtLink>

      <NuxtLink class="nav-link" to="#">
        Editor
        <span class="inline-block px-1 rounded text-xs text-fuchsia-600 font-bold leading-3 ring-1 ring-fuchsia-400">
          soon
        </span>
      </NuxtLink>
    </div>

    <div class="flex-1 ml-auto">
      <!-- TODO user -->
    </div>
  </nav>
</template>
