const ReceptorService = require('../services/receptorService')

class ReceptorController {
  constructor() {
    this.receptorService = new ReceptorService()
  }

  async addReceptor(req, res) {
    try {
      const receptor = await this.receptorService.addRecord(req.body)
      res.status(201).send({ message: 'Receptor added successfully', receptor })
    } catch (error) {
      res.status(400).json({ message: error.message })
    }
  }

  async getAllReceptor(req, res) {
    try {
      const receptores = await this.receptorService.getAllRecords()
      res.status(200).send(receptores)
    } catch (error) {
      res.status(400).json({ message: error.message })
    }
  }

  async updateReceptor(req, res) {
    try {
      await this.receptorService.updateById({ id: req.params.id, data: req.body })
      res.status(200).json({ message: 'Update successful' })
    } catch (error) {
      res.status(400).json({ message: error.message })
    }
  }

  async deleteReceptor(req, res) {
    try {
      await this.receptorService.deleteById(req.params.id)
      res.status(200).json({ message: 'Delete successful' })
    } catch (error) {
      res.status(400).json({ message: error.message })
    }
  }
}

module.exports = ReceptorController