export const questions = {
  questions: [
    {
      id: 'areas',
      title: '¿Qué área necesita mejorar?',
      help: 'Elige una o varias opciones',
      options: [
        'Frutas y verduras',
        'Carnicería',
        'Abarrotes',
        'Caja y atención',
        'Limpieza y orden',
        'Todo está bien',
      ],
    },
    {
      id: 'dislikes',
      title: '¿Qué fue lo que no te gustó?',
      help: 'Elige una o varias opciones',
      options: [
        'Precios',
        'Calidad de productos',
        'No encontré lo que buscaba',
        'Atención',
        'Tiempo de espera',
        'Ninguna, todo bien',
      ],
    },
    {
      id: 'likes',
      title: '¿Por qué te gusta venir a esta tienda?',
      help: 'Elige una o varias opciones',
      options: [
        'Precios',
        'Calidad de frutas y verduras',
        'Calidad de carnicería',
        'Atención',
        'Limpieza y orden',
        'Todo me gustó',
      ],
    },
  ],
  rating: {
    id: 'rating',
    title: '¿Cómo te atendí?',
    help: 'Toca la carita que mejor te represente',
    options: [
      { value: 'good', label: 'Buena' },
      { value: 'regular', label: 'Regular' },
      { value: 'bad', label: 'Mala' },
    ],
  },
};
