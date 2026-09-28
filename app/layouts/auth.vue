<template>
	<NuxtLoadingIndicator color="var(--ui-primary)" position="top" :height="2" />

	<div class="main-bg-color flex min-h-dvh flex-col text-slate-100">
		<LayoutHeader />

		<UMain class="relative flex-1">
			<div class="xray-grid pointer-events-none absolute inset-0" />
			<div class="relative flex min-h-[calc(100dvh-8rem)] items-center justify-center p-4">
				<UPageCard class="w-full max-w-md border-slate-800 bg-slate-950/80 backdrop-blur">
					<slot />
				</UPageCard>
			</div>
		</UMain>

		<LayoutFooter />
	</div>
</template>
