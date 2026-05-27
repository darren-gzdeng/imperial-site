import { Link, useParams } from "react-router";
import { recipes } from "../data/recipes";

export default function RecipeDetail() {
  const { slug } = useParams();
  const recipe = recipes.find((entry) => entry.slug === slug);

  if (!recipe) {
    return (
      <section className="recipe-missing">
        <h1>Recipe not found.</h1>
        <Link to="/chef-recipe">Back to Chef&apos;s Recipe</Link>
      </section>
    );
  }

  return (
    <article className="recipe-detail">
      <Link to="/chef-recipe" className="recipe-back">
        Back to Chef&apos;s Recipe
      </Link>

      <div className="recipe-detail-hero">
        <img src={recipe.image} alt={recipe.title} />
        <header>
          <p className="recipe-eyebrow">{recipe.product}</p>
          <h1>{recipe.title}</h1>
          <p className="recipe-detail-time">{recipe.time}</p>
        </header>
      </div>

      <div className="recipe-detail-body">
        <section>
          <h2>Ingredients</h2>
          <ul>
            {recipe.ingredients.map((ingredient) => (
              <li key={ingredient}>{ingredient}</li>
            ))}
          </ul>
        </section>

        <section>
          <h2>Method</h2>
          <ol>
            {recipe.method.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      </div>
    </article>
  );
}
