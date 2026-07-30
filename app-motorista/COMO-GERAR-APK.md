# Como gerar o APK do VETRA Motorista

O APK é o arquivo que instala o app no celular dos motoristas (sem Play Store).
Ele é montado na nuvem do Expo (serviço EAS Build, plano grátis).

## 1. Criar a conta (só na primeira vez)

1. Entre em https://expo.dev/signup
2. Crie a conta grátis (pode usar o e-mail da Nexus).

## 2. Entrar na conta pelo computador (só na primeira vez)

No prompt do Claude Code, digite:

```
! npx -y eas-cli@latest login
```

Ele vai pedir o e-mail e a senha da conta criada.

## 3. Gerar o APK

Peça pro Claude "gerar o APK do app do motorista", ou rode:

```
cd C:\Users\mdena\fleet-cd\app-motorista
npm run apk
```

- Na primeira vez ele pergunta se pode criar o projeto no Expo e a chave de
  assinatura Android — é só aceitar (responder Yes/Enter).
- O build entra numa fila gratuita (pode levar de 10 a 40 minutos).
- No final aparece um **link para baixar o APK**. Esse link pode ser aberto
  direto no celular do motorista: baixar → tocar no arquivo → instalar
  (o Android pergunta se permite "instalar de fontes desconhecidas" → sim).

## 4. No celular do motorista

1. Instalar o APK.
2. Abrir o app VETRA Motorista.
3. Na primeira tela, tocar em "Endereço do servidor" e digitar o endereço
   que o gestor passar (ex.: o túnel https do servidor ou o IP da rede).
4. Entrar com CPF e a senha cadastrada no sistema.
5. Abrir a viagem em andamento e tocar em **Iniciar rastreio**.
6. Na permissão de localização, escolher **"Permitir o tempo todo"**
   (é isso que deixa funcionar com a tela bloqueada).

## Observações

- Enquanto o rastreio está ligado aparece uma notificação fixa "VETRA".
  É proposital: é ela que impede o Android de matar o GPS.
- Sem internet (estrada), os pontos ficam guardados no celular e são
  enviados quando o sinal volta.
- Motorista de teste no banco local: CPF 70198704909, senha motorista123.
