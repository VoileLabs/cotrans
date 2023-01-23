<script setup lang="ts">
import { useToggle } from '@vueuse/core'
import 'uno.css'

const [show, toggle] = useToggle(false)
</script>

<template>
  <div class="fixed right-0 bottom-0 m-5 z-100 flex font-sans select-none leading-1em">
    blank!
  </div>
</template>
