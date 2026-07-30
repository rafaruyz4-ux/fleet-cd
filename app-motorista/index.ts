import { registerRootComponent } from 'expo';

// Importado ANTES do App: define a tarefa de GPS em 2º plano no arranque.
// O Android acorda o app em modo "headless" (sem UI) para entregar posições,
// e nesse modo a tarefa precisa já estar registrada.
import './src/rastreio';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
