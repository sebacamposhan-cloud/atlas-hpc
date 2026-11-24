// Enter the explicitly confirmed planning view, then expose the existing commitment registry for legacy cycle checks.
export async function enterPlanning(page){const enter=page.locator('[data-plan-enter]');if(await enter.count())await enter.click();const register=page.locator('[data-plan-register]');if(await register.count()&&await register.getAttribute('open')===null)await register.locator('summary').first().click();}

// Abre Last Planner con la navegación actual: en celular desde «Más», en escritorio desde la tarjeta de Obra.
export async function openLastPlanner(page){if(await page.locator('#terrenoMas').isVisible()){await page.locator('#terrenoMas').click();await page.locator('.acceso').filter({hasText:'Last Planner'}).click();}else{const card=page.locator('[data-tarjeta=lastplanner]');if(!(await card.isVisible()))await page.locator('#bottomObra').click();await card.click();}}
