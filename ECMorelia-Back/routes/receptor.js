const express = require('express')
const router = express.Router()
const ReceptorController = require('../controllers/receptorController')
const receptorController = new ReceptorController()

router.get('/', receptorController.getAllReceptor.bind(receptorController))
router.post('/', receptorController.addReceptor.bind(receptorController))
router.put('/:id', receptorController.updateReceptor.bind(receptorController))
router.delete('/:id', receptorController.deleteReceptor.bind(receptorController))

module.exports = router