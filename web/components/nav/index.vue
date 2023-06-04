<script setup lang="ts">

</script>

<template>
  <nav class="flex items-end mx-2 mb-1 h-7 font-quicksand">
    <div class="flex-auto flex gap-4">
      <div class="text-zinc-800 font-semibold">
        Cotrans
      </div>

      <NuxtLink class="nav-link" to="/">
        Translator
      </NuxtLink>

      <NuxtLink class="nav-link" target="_blank" to="https://greasyfork.org/scripts/437569">
        UserScript
      </NuxtLink>

      <NuxtLink class="nav-link" to="#">
        Editor
        <span class="inline-block px-1 pb-px rounded text-xs text-fuchsia-600 font-bold leading-3 ring-1 ring-fuchsia-400">
          soon
        </span>
      </NuxtLink>
    </div>

    <div class="flex-1 ml-auto">
      <!-- TODO user -->
    </div>
  </nav>
</template>
