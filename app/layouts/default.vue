<template>
	<NuxtLoadingIndicator color="var(--ui-primary)" position="top" :height="2" />
	<div class="main-bg-color flex min-h-dvh flex-col text-slate-100">
		<slot />
	</div>
</template>
