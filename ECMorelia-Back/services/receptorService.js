const prisma = require('../config/prisma')

class ReceptorService {
  async addRecord(data) {
    try {
      const exists = await prisma.receptor.findFirst({
        where: { licencia_medica: data.licencia_medica }
      })
      if (exists) throw new Error('Receptor already exists')

      return await prisma.receptor.create({ data })
    } catch (error) {
      throw new Error(error.message)
    }
  }

  async getAllRecords() {
    try {
      const records = await prisma.receptor.findMany({
        select: { id: true, nombre: true, turno: true, licencia_medica: true }
      })
      return records.length ? records : []
    } catch (error) {
      throw new Error(error.message)
    }
  }

  async updateById({ id, data }) {
    try {
      const exists = await prisma.receptor.findUnique({ where: { id: parseInt(id) } })
      if (!exists) throw new Error('Receptor not found')

      await prisma.receptor.update({
        where: { id: parseInt(id) },
        data
      })
      return { message: 'Receptor updated successfully' }
    } catch (error) {
      throw new Error(error.message)
    }
  }

  async deleteById(id) {
    try {
      const exists = await prisma.receptor.findUnique({ where: { id: parseInt(id) } })
      if (!exists) throw new Error('Receptor not found')

      await prisma.receptor.delete({ where: { id: parseInt(id) } })
      return { message: 'Receptor deleted successfully' }
    } catch (error) {
      throw new Error(error.message)
    }
  }
}

module.exports = ReceptorService