import { onlyDigits } from './format'

// Consulta o endereço pelo CEP (ViaCEP). Retorna null se não encontrar ou estiver offline.
export async function lookupCep(cep) {
  const digits = onlyDigits(cep)
  if (digits.length !== 8) return null
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
    if (!res.ok) return null
    const data = await res.json()
    if (data.erro) return null
    return { street: data.logradouro || '', district: data.bairro || '', city: data.localidade || '', state: data.uf || '' }
  } catch {
    return null
  }
}
